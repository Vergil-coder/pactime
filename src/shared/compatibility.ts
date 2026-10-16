// Keep these identities stable so existing installs retain rules, history and preferences.
export const legacyAppId = 'org.yuliang.applimits';
export const legacyDataName = 'yuliang-app-limits';
export const storageKeys = {
  appearance: 'yuliang-appearance',
  demoState: 'yuliang-demo-v1',
  demoReminderPopup: 'yuliang-demo-reminder-popup'
} as const;

// Prefer the current names while accepting existing local launch configurations.
export function runtimeEnvironment(env: Record<string, string | undefined>) {
  return {
    demo: env.PACTIME_DEMO ?? env.YULIANG_DEMO,
    devUrl: env.PACTIME_DEV_URL ?? env.YULIANG_DEV_URL,
    testData: env.PACTIME_TEST_DATA ?? env.YULIANG_TEST_DATA
  };
}
