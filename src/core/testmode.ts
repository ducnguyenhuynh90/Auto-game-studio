// Phone test mode (tools/phone-test.mjs, the CI emulator test, docs/PHONE_TESTING.md): the bot plays a fresh
// village. The test keeps its game in a separate save slot, keeps its analytics in memory (never stored or
// sent) and skips cloud sync, so testing on your own phone never touches your real progress.
// The browser turns it on with a session flag; the app with a launch link (mobile/src/autotest.ts).
export const PHONE_TEST_FLAG = 'mam_phone_test';

export function isPhoneTest(): boolean {
  if ((globalThis as { __MAM_PHONE_TEST__?: boolean }).__MAM_PHONE_TEST__) return true;
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PHONE_TEST_FLAG) === '1';
  } catch {
    return false;
  }
}
