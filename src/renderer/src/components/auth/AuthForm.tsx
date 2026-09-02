import type { AuthConfig, AuthType, RequestData } from '@shared/types/request';
import { Input } from '../ui/Input';

interface AuthFormProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'api-key', label: 'API Key' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'oauth1', label: 'OAuth 1.0a' },
  { value: 'hawk', label: 'Hawk' },
  { value: 'aws-sigv4', label: 'AWS Signature v4' },
  { value: 'ntlm', label: 'NTLM' },
  { value: 'kerberos', label: 'Kerberos' },
];

function str(v: string | undefined): string {
  return v ?? '';
}

export function AuthForm({ request, onChange }: AuthFormProps) {
  const auth = request.auth ?? { type: 'none' };
  const setAuth = (patch: Partial<AuthConfig>) => onChange({ auth: { ...auth, ...patch } });

  return (
    <div className="space-y-3 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--text-secondary)]">Type</span>
        <select
          value={auth.type}
          onChange={(e) => setAuth({ type: e.target.value as AuthType })}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none"
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {auth.type === 'none' && (
        <p className="text-sm text-[var(--text-secondary)]">This request does not use authentication.</p>
      )}

      {auth.type === 'bearer' && (
        <Input
          label="Token"
          value={str(auth.bearer?.token)}
          onChange={(e) => setAuth({ bearer: { token: e.target.value } })}
          placeholder="eyJhbGciOi…"
        />
      )}

      {auth.type === 'api-key' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Key"
            value={str(auth.apiKey?.key)}
            onChange={(e) =>
              setAuth({
                apiKey: {
                  key: e.target.value,
                  value: str(auth.apiKey?.value),
                  in: auth.apiKey?.in ?? 'header',
                },
              })
            }
          />
          <Input
            label="Value"
            value={str(auth.apiKey?.value)}
            onChange={(e) =>
              setAuth({
                apiKey: {
                  key: str(auth.apiKey?.key),
                  value: e.target.value,
                  in: auth.apiKey?.in ?? 'header',
                },
              })
            }
          />
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Add to</span>
            <select
              value={auth.apiKey?.in ?? 'header'}
              onChange={(e) =>
                setAuth({
                  apiKey: {
                    key: str(auth.apiKey?.key),
                    value: str(auth.apiKey?.value),
                    in: e.target.value as 'header' | 'query',
                  },
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none"
            >
              <option value="header">Header</option>
              <option value="query">Query Params</option>
            </select>
          </label>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Username"
            value={str(auth.basic?.username)}
            onChange={(e) => setAuth({ basic: { ...auth.basic, username: e.target.value, password: str(auth.basic?.password) } })}
          />
          <Input
            label="Password"
            type="password"
            value={str(auth.basic?.password)}
            onChange={(e) => setAuth({ basic: { ...auth.basic, username: str(auth.basic?.username), password: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'digest' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Username"
            value={str(auth.digest?.username)}
            onChange={(e) => setAuth({ digest: { ...auth.digest, username: e.target.value, password: str(auth.digest?.password) } })}
          />
          <Input
            label="Password"
            type="password"
            value={str(auth.digest?.password)}
            onChange={(e) => setAuth({ digest: { ...auth.digest, username: str(auth.digest?.username), password: e.target.value } })}
          />
          <Input
            label="Realm"
            value={str(auth.digest?.realm)}
            onChange={(e) => setAuth({ digest: { ...auth.digest, username: str(auth.digest?.username), password: str(auth.digest?.password), realm: e.target.value } })}
          />
          <Input
            label="Nonce"
            value={str(auth.digest?.nonce)}
            onChange={(e) => setAuth({ digest: { ...auth.digest, username: str(auth.digest?.username), password: str(auth.digest?.password), nonce: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'oauth2' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Token URL"
            value={str(auth.oauth2?.tokenUrl as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, tokenUrl: e.target.value } })}
            placeholder="https://auth.example.com/token"
          />
          <Input
            label="Client ID"
            value={str(auth.oauth2?.clientId as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, clientId: e.target.value } })}
          />
          <Input
            label="Client Secret"
            type="password"
            value={str(auth.oauth2?.clientSecret as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, clientSecret: e.target.value } })}
          />
          <Input
            label="Scope"
            value={str(auth.oauth2?.scope as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, scope: e.target.value } })}
            placeholder="read:users write:users"
          />
          <Input
            label="Grant Type"
            value={str(auth.oauth2?.grantType as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, grantType: e.target.value } })}
            placeholder="client_credentials"
          />
          <Input
            label="Access Token"
            value={str(auth.oauth2?.accessToken as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, accessToken: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'oauth1' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Consumer Key"
            value={str(auth.oauth1?.consumerKey as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, consumerKey: e.target.value } })}
          />
          <Input
            label="Consumer Secret"
            type="password"
            value={str(auth.oauth1?.consumerSecret as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, consumerSecret: e.target.value } })}
          />
          <Input
            label="Token"
            value={str(auth.oauth1?.token as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, token: e.target.value } })}
          />
          <Input
            label="Token Secret"
            type="password"
            value={str(auth.oauth1?.tokenSecret as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, tokenSecret: e.target.value } })}
          />
          <Input
            label="Signature Method"
            value={str(auth.oauth1?.signatureMethod as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, signatureMethod: e.target.value } })}
            placeholder="HMAC-SHA1"
          />
          <Input
            label="Realm"
            value={str(auth.oauth1?.realm as string)}
            onChange={(e) => setAuth({ oauth1: { ...auth.oauth1, realm: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'hawk' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Hawk Key ID"
            value={str(auth.hawk?.id as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, id: e.target.value } })}
          />
          <Input
            label="Hawk Key"
            type="password"
            value={str(auth.hawk?.key as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, key: e.target.value } })}
          />
          <Input
            label="Algorithm"
            value={str(auth.hawk?.algorithm as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, algorithm: e.target.value } })}
            placeholder="sha256"
          />
          <Input
            label="User"
            value={str(auth.hawk?.user as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, user: e.target.value } })}
          />
          <Input
            label="Nonce"
            value={str(auth.hawk?.nonce as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, nonce: e.target.value } })}
          />
          <Input
            label="Timestamp (ms)"
            value={str(auth.hawk?.timestamp as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, timestamp: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'aws-sigv4' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Access Key"
            value={str(auth.awsSigV4?.accessKey as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, accessKey: e.target.value } })}
          />
          <Input
            label="Secret Key"
            type="password"
            value={str(auth.awsSigV4?.secretKey as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, secretKey: e.target.value } })}
          />
          <Input
            label="Region"
            value={str(auth.awsSigV4?.region as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, region: e.target.value } })}
            placeholder="us-east-1"
          />
          <Input
            label="Service"
            value={str(auth.awsSigV4?.service as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, service: e.target.value } })}
            placeholder="execute-api"
          />
          <Input
            label="Session Token"
            value={str(auth.awsSigV4?.sessionToken as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, sessionToken: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'ntlm' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Username"
            value={str(auth.ntlm?.username as string)}
            onChange={(e) => setAuth({ ntlm: { ...auth.ntlm, username: e.target.value } })}
          />
          <Input
            label="Password"
            type="password"
            value={str(auth.ntlm?.password as string)}
            onChange={(e) => setAuth({ ntlm: { ...auth.ntlm, password: e.target.value } })}
          />
          <Input
            label="Domain"
            value={str(auth.ntlm?.domain as string)}
            onChange={(e) => setAuth({ ntlm: { ...auth.ntlm, domain: e.target.value } })}
          />
          <Input
            label="Workstation"
            value={str(auth.ntlm?.workstation as string)}
            onChange={(e) => setAuth({ ntlm: { ...auth.ntlm, workstation: e.target.value } })}
          />
        </div>
      )}

      {auth.type === 'kerberos' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Principal"
            value={str(auth.kerberos?.principal as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, principal: e.target.value } })}
            placeholder="user@REALM"
          />
          <Input
            label="Service"
            value={str(auth.kerberos?.service as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, service: e.target.value } })}
            placeholder="HTTP/host"
          />
          <Input
            label="Realm"
            value={str(auth.kerberos?.realm as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, realm: e.target.value } })}
          />
          <Input
            label="Keytab Path"
            value={str(auth.kerberos?.keytab as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, keytab: e.target.value } })}
          />
        </div>
      )}
    </div>
  );
}
