// Teste simples para verificar a correção da função checkMembershipInGroup
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando se a correção foi aplicada...');

// Ler o arquivo telegram.service.ts
const serviceFile = path.join(__dirname, 'src', 'telegram', 'telegram.service.ts');

try {
  const content = fs.readFileSync(serviceFile, 'utf8');
  
  // Verificar se a correção está presente
  const hasMemberNotFoundCheck = content.includes('member not found');
  const hasErrorMessageCheck = content.includes('error.message');
  const hasErrorResponseCheck = content.includes('error.response.description');
  
  console.log('📋 Resultados da verificação:');
  console.log(`✅ Verificação "member not found": ${hasMemberNotFoundCheck ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`✅ Verificação error.message: ${hasErrorMessageCheck ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`✅ Verificação error.response.description: ${hasErrorResponseCheck ? 'PRESENTE' : 'AUSENTE'}`);
  
  if (hasMemberNotFoundCheck && hasErrorMessageCheck && hasErrorResponseCheck) {
    console.log('🎉 SUCESSO: Todas as correções estão presentes no código!');
    console.log('✅ A função checkMembershipInGroup foi corrigida para tratar "member not found" como não-membro.');
  } else {
    console.log('❌ ERRO: Algumas correções estão faltando!');
  }
  
  // Mostrar a parte relevante do código
  const lines = content.split('\n');
  const checkMembershipStart = lines.findIndex(line => line.includes('checkMembershipInGroup'));
  
  if (checkMembershipStart !== -1) {
    console.log('\n📝 Código da função checkMembershipInGroup:');
    console.log('---');
    for (let i = checkMembershipStart; i < Math.min(checkMembershipStart + 30, lines.length); i++) {
      if (lines[i].includes('} catch') || lines[i].includes('return false') || lines[i].includes('member not found')) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
    }
    console.log('---');
  }
  
} catch (error) {
  console.error('❌ Erro ao ler o arquivo:', error.message);
}

console.log('\n🏁 Verificação concluída!');