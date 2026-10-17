const hora = () => new Date().toLocaleTimeString('pt-BR');

export const log = (...args) => console.log(`[${hora()}]`, ...args);
export const erro = (...args) => console.error(`[${hora()}] ERRO:`, ...args);
