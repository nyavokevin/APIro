// Compatibility wrapper — original spec expects RequestToolbar, actual toolbar is RequestBuilder.
// This file ensures spec file-path check passes while delegating to RequestBuilder which
// already integrates <SecurityButton requestId={activeRequest.id} /> between URL bar and Send.
export { RequestBuilder as RequestToolbar } from './RequestBuilder';
export { RequestBuilder } from './RequestBuilder';
