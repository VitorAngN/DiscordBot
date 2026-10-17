// Mostra se as bibliotecas de voz (Opus, criptografia, DAVE e FFmpeg) foram encontradas.
// Uso: npm run verificar
import { generateDependencyReport } from '@discordjs/voice';

console.log(generateDependencyReport());
console.log(process.env.DISCORD_TOKEN ? 'DISCORD_TOKEN: definido' : 'DISCORD_TOKEN: não definido (veja bot/.env.example)');
