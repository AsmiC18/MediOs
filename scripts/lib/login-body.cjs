function loginBody(email, password = 'MediOS@12345', hospitalCode) {
  return {
    email,
    password,
    hospitalCode:
      hospitalCode ||
      process.env.MEDIOS_TEST_HOSPITAL_CODE ||
      process.env.MEDIOS_DEMO_HOSPITAL_CODE ||
      'DEMO',
  };
}

module.exports = { loginBody };
