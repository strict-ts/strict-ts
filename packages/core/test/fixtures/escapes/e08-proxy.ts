// A proxy that was revoked: every use of it throws.
const { proxy, revoke } = Proxy.revocable({ size: 1 }, {});
revoke();
export const size: number = proxy.size;
