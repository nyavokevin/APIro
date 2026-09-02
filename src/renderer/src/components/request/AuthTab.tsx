import type { RequestData } from '@shared/types/request';
import { AuthForm } from '../auth/AuthForm';

interface AuthTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function AuthTab({ request, onChange }: AuthTabProps) {
  return <AuthForm request={request} onChange={onChange} />;
}
