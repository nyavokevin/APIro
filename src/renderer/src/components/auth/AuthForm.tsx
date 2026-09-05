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

const selectCls =
  'w-full border bg-[#0E0E10] px-3 text-sm text-[#E6E8F0] outline-none transition-all duration-200 hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:bg-[#121215]';
const selectStyle: React.CSSProperties = {
  height: '40px',
  borderColor: '#232329',
  borderRadius: '0px',
};

export function AuthForm({ request, onChange }: AuthFormProps) {
  const auth = request.auth ?? { type: 'none' };
  const setAuth = (patch: Partial<AuthConfig>) => onChange({ auth: { ...auth, ...patch } });

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header pill */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 border bg-[#121215] px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-[#9FA3B5]"
          style={{ borderColor: '#232329' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" aria-hidden />
          Authentication
        </span>
        <span className="text-xs" style={{ color: '#5A5E6E' }}>
          {auth.type === 'none' ? 'No auth' : AUTH_TYPES.find((a) => a.value === auth.type)?.label}
        </span>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium tracking-[0.02em] text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>
          Type
        </span>
        <select
          value={auth.type}
          onChange={(e) => setAuth({ type: e.target.value as AuthType })}
          className={selectCls}
          style={selectStyle}
          onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)')}
          onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.value} value={t.value} style={{ background: '#121215' }}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {auth.type === 'none' && (
        <div className="border border-dashed bg-[#0E0E10]/50 px-3 py-4 text-center" style={{ borderColor: '#232329' }}>
          <p className="text-sm tracking-[-0.01em] text-[#7A7F93]">This request does not use authentication.</p>
          <p className="mt-1 text-xs" style={{ color: '#5A5E6E' }}>
            Choose a type above to add credentials. They’re applied at send time and never logged.
          </p>
        </div>
      )}

      {auth.type === 'bearer' && (
        <Input
          label="Token"
          value={str(auth.bearer?.token)}
          onChange={(e) => setAuth({ bearer: { token: e.target.value } })}
          placeholder="eyJhbGciOi…"
          className="font-mono tabular-nums"
        />
      )}

      {auth.type === 'api-key' && (
        <div className="grid grid-cols-2 gap-3">
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
            placeholder="X-API-Key"
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
            placeholder="••••••••"
            className="font-mono tabular-nums"
          />
          <label className="col-span-2 block">
            <span className="mb-1.5 block text-xs font-medium tracking-[0.02em] text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>
              Add to
            </span>
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
              className={selectCls}
              style={selectStyle}
              onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)')}
              onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
            >
              <option value="header" style={{ background: '#121215' }}>Header</option>
              <option value="query" style={{ background: '#121215' }}>Query Params</option>
            </select>
          </label>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
            className="font-mono tabular-nums"
          />
        </div>
      )}

      {auth.type === 'oauth2' && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Token URL"
            value={str(auth.oauth2?.tokenUrl as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, tokenUrl: e.target.value } })}
            placeholder="https://auth.example.com/token"
            className="font-mono"
          />
          <Input
            label="Client ID"
            value={str(auth.oauth2?.clientId as string)}
            onChange={(e) => setAuth({ oauth2: { ...auth.oauth2, clientId: e.target.value } })}
            className="font-mono tabular-nums"
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
            className="font-mono tabular-nums"
          />
        </div>
      )}

      {auth.type === 'oauth1' && (
        <div className="grid grid-cols-2 gap-3">
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
            className="font-mono tabular-nums"
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
        <div className="grid grid-cols-2 gap-3">
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
            className="font-mono tabular-nums"
          />
          <Input
            label="Timestamp (ms)"
            value={str(auth.hawk?.timestamp as string)}
            onChange={(e) => setAuth({ hawk: { ...auth.hawk, timestamp: e.target.value } })}
            className="font-mono tabular-nums"
          />
        </div>
      )}

      {auth.type === 'aws-sigv4' && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Access Key"
            value={str(auth.awsSigV4?.accessKey as string)}
            onChange={(e) => setAuth({ awsSigV4: { ...auth.awsSigV4, accessKey: e.target.value } })}
            className="font-mono tabular-nums"
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
            className="font-mono tabular-nums"
          />
        </div>
      )}

      {auth.type === 'ntlm' && (
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Principal"
            value={str(auth.kerberos?.principal as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, principal: e.target.value } })}
            placeholder="user@REALM"
            className="font-mono"
          />
          <Input
            label="Service"
            value={str(auth.kerberos?.service as string)}
            onChange={(e) => setAuth({ kerberos: { ...auth.kerberos, service: e.target.value } })}
            placeholder="HTTP/host"
            className="font-mono"
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
            className="font-mono"
          />
        </div>
      )}
    </div>
  );
}
