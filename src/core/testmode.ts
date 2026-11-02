// Phone test mode (tools/phone-test.mjs, docs/PHONE_TESTING.md): the bot plays a fresh village on a real
// phone. The test keeps its game in a separate save slot, keeps its analytics in memory (never stored or
// sent) and skips cloud sync, so testing on your own phone never touches your real progress.
export const PHONE_TEST_FLAG = 'mam_phone_test';

export function isPhoneTest(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PHONE_TEST_FLAG) === '1';
  } catch {
    return false;
  }
}
