import {callbackResponse} from '../../lib/oauth-callback';

export const dynamic = 'force-dynamic';

export function GET() {
  return callbackResponse();
}
