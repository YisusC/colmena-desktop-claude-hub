// Notification hook: emits OSC 777 (via terminalSequence) with ask or notice; the app only reacts to ask.
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let type = '';
  let message = '';
  try {
    const j = JSON.parse(raw);
    type = String(j.notification_type || '');
    message = String(j.message || '');
  } catch {
    // notification without JSON: treated as a generic notice
  }
  const ask = /permission|elicitation|needs_input|question/i.test(type) || (!type && /permission/i.test(message));
  const kind = ask ? 'ask' : 'notice';
  const seq = `\u001b]777;notify;colmena;${kind}:${type.replace(/[^\w-]/g, '')}\u0007`;
  process.stdout.write(JSON.stringify({ terminalSequence: seq }));
});
