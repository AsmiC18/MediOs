import {
  areSoapContentsEqual,
  mergeSoapContent,
  soapContentFromNote,
} from './soap-content.util';

describe('soap-content.util', () => {
  it('mergeSoapContent applies partial updates', () => {
    const base = soapContentFromNote({
      subjective: 's1',
      objective: null,
      assessment: 'a1',
      plan: null,
    });
    const merged = mergeSoapContent(base, { plan: 'p2' });
    expect(merged.subjective).toBe('s1');
    expect(merged.plan).toBe('p2');
  });

  it('areSoapContentsEqual treats null and undefined fields consistently', () => {
    const a = soapContentFromNote({ subjective: null });
    const b = soapContentFromNote({});
    expect(areSoapContentsEqual(a, b)).toBe(true);
  });
});
