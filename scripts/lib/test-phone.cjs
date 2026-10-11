function testPhone(prefixDigit = '9') {
  const validPrefixes = ['6', '7', '8', '9'];
  const prefix = validPrefixes.includes(String(prefixDigit))
    ? String(prefixDigit)
    : '9';
  return `${prefix}${`${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-9)}`;
}

module.exports = { testPhone };
