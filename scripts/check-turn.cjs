async (page) => {
  const result = await page.evaluate(async () => {
    const { callIceServers } = await import('/src/lib/ice.ts');
    const account = await fetch('http://127.0.0.1:8787/v1/auth/dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'TURN Test',email:'turn-test@nova.invalid'})}).then(r=>r.json());
    const pc = new RTCPeerConnection({ iceServers: await callIceServers(account.session), iceTransportPolicy: 'relay' });
    const types = [], errors = [];
    pc.onicecandidate = e => { if (e.candidate) types.push(e.candidate.type); };
    pc.onicecandidateerror = e => errors.push({ code: e.errorCode, text: e.errorText });
    pc.createDataChannel('relay-test');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 15000);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); } };
    });
    pc.close();
    return { relayCandidates: types.filter(t => t === 'relay').length, errors };
  });
  await page.evaluate(value => { window.__novaTurn = value; }, result);
}
