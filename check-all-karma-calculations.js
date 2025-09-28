// Script para verificar todas as implementações de conversão de estrelas para karma
const fs = require('fs');
const path = require('path');

// Função de referência correta (baseada no karma.repository.ts)
function correctConvertStarsToKarma(stars) {
  switch (stars) {
    case 5: return 5;  // 5 estrelas = +5 pontos
    case 4: return 2;  // 4 estrelas = +2 pontos
    case 3: return 0;  // 3 estrelas = neutro
    case 2: return -2; // 2 estrelas = -2 pontos
    case 1: return -5; // 1 estrela = -5 pontos
    default: return 0;
  }
}

// Arquivos a verificar
const filesToCheck = [
  'src/karma/karma.repository.ts',
  'generate-realistic-comments.js',
  'verify-karma-calculation.js',
  'src/telegram/commands/handlers/avaliar.command.handler.ts'
];

console.log('🔍 Verificando consistência de conversão de estrelas para karma...\n');

let inconsistenciesFound = 0;
let totalFiles = 0;

for (const file of filesToCheck) {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Arquivo não encontrado: ${file}`);
    continue;
  }
  
  totalFiles++;
  console.log(`📄 Verificando: ${file}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let hasConvertFunction = false;
  let hasHardcodedValues = false;
  let inconsistentValues = [];
  
  // Procurar por função convertStarsToKarma
  if (content.includes('convertStarsToKarma')) {
    hasConvertFunction = true;
    console.log('  ✅ Contém função convertStarsToKarma');
    
    // Verificar se os valores estão corretos
    const case5Match = content.match(/case 5.*return\s+(\d+)/);
    const case4Match = content.match(/case 4.*return\s+(\d+)/);
    const case3Match = content.match(/case 3.*return\s+(\d+)/);
    const case2Match = content.match(/case 2.*return\s+(-?\d+)/);
    const case1Match = content.match(/case 1.*return\s+(-?\d+)/);
    
    if (case5Match && parseInt(case5Match[1]) !== 5) {
      inconsistentValues.push(`Case 5: ${case5Match[1]} (deveria ser 5)`);
    }
    if (case4Match && parseInt(case4Match[1]) !== 2) {
      inconsistentValues.push(`Case 4: ${case4Match[1]} (deveria ser 2)`);
    }
    if (case3Match && parseInt(case3Match[1]) !== 0) {
      inconsistentValues.push(`Case 3: ${case3Match[1]} (deveria ser 0)`);
    }
    if (case2Match && parseInt(case2Match[1]) !== -2) {
      inconsistentValues.push(`Case 2: ${case2Match[1]} (deveria ser -2)`);
    }
    if (case1Match && parseInt(case1Match[1]) !== -5) {
      inconsistentValues.push(`Case 1: ${case1Match[1]} (deveria ser -5)`);
    }
  }
  
  // Procurar por valores hardcoded suspeitos
  const suspiciousPatterns = [
    /pontos.*=.*isPositive.*\?.*2.*:.*-1/,  // pontos = isPositive ? 2 : -1
    /starRating.*=.*isPositive.*\?.*5.*:.*1/, // starRating = isPositive ? 5 : 1
    /karma.*=.*\d+/,
    /points.*=.*\d+/
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(line)) {
        hasHardcodedValues = true;
        console.log(`  ⚠️  Linha ${i + 1}: ${line.trim()}`);
      }
    }
  }
  
  if (inconsistentValues.length > 0) {
    console.log(`  ❌ INCONSISTÊNCIAS ENCONTRADAS:`);
    inconsistentValues.forEach(inc => console.log(`     ${inc}`));
    inconsistenciesFound++;
  } else if (hasConvertFunction) {
    console.log(`  ✅ Valores de conversão corretos`);
  }
  
  if (hasHardcodedValues) {
    console.log(`  ⚠️  Valores hardcoded encontrados - verificar se estão corretos`);
  }
  
  console.log('');
}

// Verificar especificamente o problema no avaliar.command.handler.ts
console.log('🔍 Verificação específica do avaliar.command.handler.ts...\n');

const avaliadorPath = path.join(__dirname, 'src/telegram/commands/handlers/avaliar.command.handler.ts');
if (fs.existsSync(avaliadorPath)) {
  const content = fs.readFileSync(avaliadorPath, 'utf8');
  
  // Procurar pela linha problemática: pontos = isPositive ? 2 : -1
  const problematicLine = content.match(/const pontos = isPositive \? (\d+) : (-?\d+)/);
  
  if (problematicLine) {
    const positiveValue = parseInt(problematicLine[1]);
    const negativeValue = parseInt(problematicLine[2]);
    
    console.log(`📋 Linha encontrada: const pontos = isPositive ? ${positiveValue} : ${negativeValue}`);
    
    // Verificar se está usando o sistema correto
    // isPositive ? 5 : 1 para starRating está correto
    // Mas pontos deveria usar a função de conversão, não valores fixos
    
    if (positiveValue === 2 && negativeValue === -1) {
      console.log(`❌ PROBLEMA IDENTIFICADO!`);
      console.log(`   Esta linha usa valores fixos (2, -1) em vez da conversão correta de estrelas`);
      console.log(`   Deveria usar: convertStarsToKarma(starRating)`);
      console.log(`   Onde starRating = isPositive ? 5 : 1`);
      console.log(`   Resultado correto seria: isPositive ? 5 : -5`);
      inconsistenciesFound++;
    } else {
      console.log(`✅ Valores parecem corretos`);
    }
  }
  
  // Verificar se há uso correto da conversão em outros lugares
  const correctUsages = content.match(/convertStarsToKarma|registerStarEvaluation/g);
  if (correctUsages) {
    console.log(`✅ Encontradas ${correctUsages.length} utilizações corretas do sistema de estrelas`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`📊 RESUMO DA VERIFICAÇÃO:`);
console.log(`Arquivos verificados: ${totalFiles}`);
console.log(`Inconsistências encontradas: ${inconsistenciesFound}`);

if (inconsistenciesFound > 0) {
  console.log(`\n❌ AÇÃO NECESSÁRIA:`);
  console.log(`1. Corrigir valores inconsistentes nos arquivos identificados`);
  console.log(`2. Substituir valores hardcoded pela função convertStarsToKarma()`);
  console.log(`3. Garantir que todos usem a mesma lógica de conversão`);
  console.log(`4. Executar testes para verificar se os cálculos ficaram corretos`);
} else {
  console.log(`\n✅ TODOS OS ARQUIVOS ESTÃO CONSISTENTES!`);
}

console.log(`\n📋 VALORES DE REFERÊNCIA CORRETOS:`);
console.log(`5⭐ = +5 pontos`);
console.log(`4⭐ = +2 pontos`);
console.log(`3⭐ = 0 pontos (neutro)`);
console.log(`2⭐ = -2 pontos`);
console.log(`1⭐ = -5 pontos`);