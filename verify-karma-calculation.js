// Script para verificar se os cálculos de karma estão corretos
const { MongoClient } = require('mongodb');

// Função de conversão de estrelas para karma (igual ao código)
function convertStarsToKarma(stars) {
  switch (stars) {
    case 5: return 5;  // 5 estrelas = +5 pontos
    case 4: return 2;  // 4 estrelas = +2 pontos
    case 3: return 0;  // 3 estrelas = neutro
    case 2: return -2; // 2 estrelas = -2 pontos
    case 1: return -5; // 1 estrela = -5 pontos
    default: return 0;
  }
}

async function verifyKarmaCalculations() {
  const uri = 'mongodb://ipmais:As5173121220*@mongo.ipmais.com:27077/trustscore_bot?authSource=admin';
  const client = new MongoClient(uri);
  
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const karmaCollection = db.collection('karmas');
    
    const karmaDocuments = await karmaCollection.find({}).toArray();
    console.log(`📊 Analisando ${karmaDocuments.length} documentos de karma...\n`);
    
    let totalInconsistencies = 0;
    
    for (const doc of karmaDocuments) {
      console.log(`📋 Documento ID: ${doc._id}`);
      console.log(`👤 User ID: ${doc.user}`);
      console.log(`📊 Karma Atual: ${doc.karma}`);
      
      // Calcular karma esperado baseado no histórico
      let expectedKarma = 0;
      let starBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      
      if (doc.history && doc.history.length > 0) {
        for (const entry of doc.history) {
          if (entry.starRating) {
            // Avaliação com estrelas
            const karmaPoints = convertStarsToKarma(entry.starRating);
            expectedKarma += karmaPoints;
            starBreakdown[entry.starRating]++;
            console.log(`  ⭐ ${entry.starRating} estrelas = ${karmaPoints} pontos (${entry.comment || 'Sem comentário'})`);
          } else if (entry.karmaChange !== undefined) {
            // Avaliação antiga (sem estrelas)
            expectedKarma += entry.karmaChange;
            console.log(`  📈 Karma direto = ${entry.karmaChange} pontos (${entry.comment || 'Sem comentário'})`);
          }
        }
      }
      
      console.log(`\n🧮 Cálculo Esperado:`);
      console.log(`  1⭐ x ${starBreakdown[1]} = ${starBreakdown[1] * convertStarsToKarma(1)} pontos`);
      console.log(`  2⭐ x ${starBreakdown[2]} = ${starBreakdown[2] * convertStarsToKarma(2)} pontos`);
      console.log(`  3⭐ x ${starBreakdown[3]} = ${starBreakdown[3] * convertStarsToKarma(3)} pontos`);
      console.log(`  4⭐ x ${starBreakdown[4]} = ${starBreakdown[4] * convertStarsToKarma(4)} pontos`);
      console.log(`  5⭐ x ${starBreakdown[5]} = ${starBreakdown[5] * convertStarsToKarma(5)} pontos`);
      console.log(`  Total Esperado: ${expectedKarma}`);
      
      // Verificar contadores de estrelas
      console.log(`\n📊 Contadores no Documento:`);
      console.log(`  stars1: ${doc.stars1 || 0} (esperado: ${starBreakdown[1]})`);
      console.log(`  stars2: ${doc.stars2 || 0} (esperado: ${starBreakdown[2]})`);
      console.log(`  stars3: ${doc.stars3 || 0} (esperado: ${starBreakdown[3]})`);
      console.log(`  stars4: ${doc.stars4 || 0} (esperado: ${starBreakdown[4]})`);
      console.log(`  stars5: ${doc.stars5 || 0} (esperado: ${starBreakdown[5]})`);
      
      // Verificar inconsistências
      const karmaInconsistent = doc.karma !== expectedKarma;
      const stars1Inconsistent = (doc.stars1 || 0) !== starBreakdown[1];
      const stars2Inconsistent = (doc.stars2 || 0) !== starBreakdown[2];
      const stars3Inconsistent = (doc.stars3 || 0) !== starBreakdown[3];
      const stars4Inconsistent = (doc.stars4 || 0) !== starBreakdown[4];
      const stars5Inconsistent = (doc.stars5 || 0) !== starBreakdown[5];
      
      if (karmaInconsistent || stars1Inconsistent || stars2Inconsistent || 
          stars3Inconsistent || stars4Inconsistent || stars5Inconsistent) {
        console.log(`\n❌ INCONSISTÊNCIAS ENCONTRADAS:`);
        
        if (karmaInconsistent) {
          console.log(`  🔴 Karma: ${doc.karma} (atual) vs ${expectedKarma} (esperado) - Diferença: ${doc.karma - expectedKarma}`);
        }
        
        if (stars1Inconsistent) {
          console.log(`  🔴 Stars1: ${doc.stars1 || 0} (atual) vs ${starBreakdown[1]} (esperado)`);
        }
        
        if (stars2Inconsistent) {
          console.log(`  🔴 Stars2: ${doc.stars2 || 0} (atual) vs ${starBreakdown[2]} (esperado)`);
        }
        
        if (stars3Inconsistent) {
          console.log(`  🔴 Stars3: ${doc.stars3 || 0} (atual) vs ${starBreakdown[3]} (esperado)`);
        }
        
        if (stars4Inconsistent) {
          console.log(`  🔴 Stars4: ${doc.stars4 || 0} (atual) vs ${starBreakdown[4]} (esperado)`);
        }
        
        if (stars5Inconsistent) {
          console.log(`  🔴 Stars5: ${doc.stars5 || 0} (atual) vs ${starBreakdown[5]} (esperado)`);
        }
        
        totalInconsistencies++;
      } else {
        console.log(`\n✅ DOCUMENTO CONSISTENTE`);
      }
      
      console.log(`\n${'='.repeat(80)}\n`);
    }
    
    console.log(`\n📊 RESUMO FINAL:`);
    console.log(`Total de documentos analisados: ${karmaDocuments.length}`);
    console.log(`Documentos com inconsistências: ${totalInconsistencies}`);
    console.log(`Documentos consistentes: ${karmaDocuments.length - totalInconsistencies}`);
    
    if (totalInconsistencies > 0) {
      console.log(`\n⚠️  AÇÃO RECOMENDADA: Execute o script de correção para sincronizar os dados.`);
    } else {
      console.log(`\n✅ TODOS OS DADOS ESTÃO CONSISTENTES!`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

verifyKarmaCalculations();