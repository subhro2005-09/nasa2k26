const subs = new Set();
export const toast = (msg, tone = 'info', detail) => subs.forEach((f) => f({ id: Math.random(), msg, tone, detail }));
export const onToast = (f) => (subs.add(f), () => subs.delete(f));
