import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async () => {
  return new Response('Hello, from API!');
});
