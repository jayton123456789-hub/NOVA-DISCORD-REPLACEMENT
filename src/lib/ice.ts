import { serviceRequest } from './service';

type IceResponse = { iceServers: RTCIceServer[]; relayAvailable: boolean };

// NOVA obtains TURN credentials from its own account service so normal users never
// receive a permanent TURN secret. If the service or TURN pool is unavailable,
// direct WebRTC still gets public STUN candidates and the UI reports relay failure.
export async function callIceServers(sessionToken: string): Promise<RTCIceServer[]> {
  try {
    const value = await serviceRequest<IceResponse>('/v1/media/ice', {}, sessionToken);
    if (Array.isArray(value.iceServers) && value.iceServers.length) return value.iceServers;
  } catch { /* direct WebRTC can still work without the service */ }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
}
