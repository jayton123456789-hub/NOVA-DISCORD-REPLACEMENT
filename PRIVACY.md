# NOVA private-beta privacy notice

NOVA is designed to collect the minimum account data needed to operate the private social service.

The online account service may store a Google account identifier, email address, display name, optional avatar URL, registered device public keys, Space membership, and service-session metadata. NOVA does not receive or store a user's Google password.

On Windows, NOVA stores its service session and private device-key material through Windows user-scoped protected storage (DPAPI). Ordinary Space chat history remains in the local NOVA databases in the current host-based architecture. The bounded internet control relay carries encrypted NOVA payloads; it is not an audio/video or file-content relay.

Google processes the authentication flow. Cloudflare hosts NOVA's limited account, admission, rendezvous, and encrypted-control infrastructure. NOVA does not sell account data to advertisers.

Future distributed replication can change where encrypted replicas are held. The application should disclose that change before enabling it for users.

This private-beta notice should receive legal review before a broad public launch.
