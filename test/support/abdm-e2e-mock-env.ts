/** Side-effect import: run before ABDM module graph loads in staff-route HTTP e2e. */
process.env.ABDM_MOCK_MODE = 'true';
process.env.ABDM_ENV = 'sandbox';
