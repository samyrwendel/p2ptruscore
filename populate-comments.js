// Script para popular a coleção de comentários com dados iniciais
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

// Comentários organizados por nível de estrelas e categoria
const commentsData = [
  // 5 Estrelas - Positivos
  { starLevel: 5, category: 'positive', text: 'Excelente transação! Muito confiável e rápido.' },
  { starLevel: 5, category: 'positive', text: 'Perfeito! Recomendo totalmente.' },
  { starLevel: 5, category: 'positive', text: 'Transação impecável, pessoa de confiança.' },
  { starLevel: 5, category: 'positive', text: 'Muito bom negociar com essa pessoa!' },
  { starLevel: 5, category: 'positive', text: 'Excelente comunicação e pontualidade.' },
  { starLevel: 5, category: 'positive', text: 'Transação perfeita, sem problemas.' },
  { starLevel: 5, category: 'positive', text: 'Pessoa muito confiável e honesta.' },
  { starLevel: 5, category: 'positive', text: 'Ótima experiência, super recomendo!' },
  { starLevel: 5, category: 'positive', text: 'Transação rápida e segura, parabéns!' },
  { starLevel: 5, category: 'positive', text: 'Excelente vendedor, muito profissional.' },
  
  // 4 Estrelas - Positivos
  { starLevel: 4, category: 'positive', text: 'Boa transação, tudo certo.' },
  { starLevel: 4, category: 'positive', text: 'Transação ok, pessoa confiável.' },
  { starLevel: 4, category: 'positive', text: 'Bom negócio, recomendo.' },
  { starLevel: 4, category: 'positive', text: 'Tudo tranquilo, boa pessoa.' },
  { starLevel: 4, category: 'positive', text: 'Transação sem problemas.' },
  { starLevel: 4, category: 'positive', text: 'Pessoa séria, boa negociação.' },
  { starLevel: 4, category: 'positive', text: 'Tudo certo, obrigado!' },
  { starLevel: 4, category: 'positive', text: 'Boa experiência, recomendo.' },
  { starLevel: 4, category: 'positive', text: 'Transação satisfatória.' },
  { starLevel: 4, category: 'positive', text: 'Bom atendimento e honestidade.' },
  
  // 3 Estrelas - Neutros
  { starLevel: 3, category: 'neutral', text: 'Transação normal, sem problemas.' },
  { starLevel: 3, category: 'neutral', text: 'Ok, tudo certo.' },
  { starLevel: 3, category: 'neutral', text: 'Transação padrão.' },
  { starLevel: 3, category: 'neutral', text: 'Normal, sem intercorrências.' },
  { starLevel: 3, category: 'neutral', text: 'Tudo ok.' },
  { starLevel: 3, category: 'neutral', text: 'Transação comum.' },
  { starLevel: 3, category: 'neutral', text: 'Dentro do esperado.' },
  { starLevel: 3, category: 'neutral', text: 'Transação regular.' },
  
  // 2 Estrelas - Negativos
  { starLevel: 2, category: 'negative', text: 'Transação com alguns problemas.' },
  { starLevel: 2, category: 'negative', text: 'Demorou um pouco mais que o esperado.' },
  { starLevel: 2, category: 'negative', text: 'Alguns contratempos, mas resolveu.' },
  { starLevel: 2, category: 'negative', text: 'Não foi a melhor experiência.' },
  { starLevel: 2, category: 'negative', text: 'Teve alguns problemas de comunicação.' },
  { starLevel: 2, category: 'negative', text: 'Transação demorada.' },
  { starLevel: 2, category: 'negative', text: 'Algumas dificuldades no processo.' },
  { starLevel: 2, category: 'negative', text: 'Poderia ter sido melhor.' },
  
  // 1 Estrela - Negativos
  { starLevel: 1, category: 'negative', text: 'Transação problemática.' },
  { starLevel: 1, category: 'negative', text: 'Muitos problemas na negociação.' },
  { starLevel: 1, category: 'negative', text: 'Não recomendo.' },
  { starLevel: 1, category: 'negative', text: 'Experiência ruim.' },
  { starLevel: 1, category: 'negative', text: 'Muita demora e problemas.' },
  { starLevel: 1, category: 'negative', text: 'Pessoa não confiável.' },
  { starLevel: 1, category: 'negative', text: 'Transação mal conduzida.' },
  { starLevel: 1, category: 'negative', text: 'Não cumpriu o combinado.' }
];

async function populateComments() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const commentsCollection = db.collection('comments');
    
    // Verificar se já existem comentários
    const existingCount = await commentsCollection.countDocuments();
    
    if (existingCount > 0) {
      console.log(`📋 Já existem ${existingCount} comentários na coleção`);
      console.log('🔄 Limpando comentários existentes...');
      await commentsCollection.deleteMany({});
    }
    
    // Adicionar timestamp aos comentários
    const commentsWithTimestamp = commentsData.map(comment => ({
      ...comment,
      createdAt: new Date()
    }));
    
    console.log('📝 Inserindo comentários...');
    const result = await commentsCollection.insertMany(commentsWithTimestamp);
    
    console.log(`✅ ${result.insertedCount} comentários inseridos com sucesso!`);
    
    // Mostrar estatísticas por nível de estrelas
    console.log('\n📊 Estatísticas por nível de estrelas:');
    for (let stars = 1; stars <= 5; stars++) {
      const count = await commentsCollection.countDocuments({ starLevel: stars });
      console.log(`  ${stars}⭐: ${count} comentários`);
    }
    
    // Mostrar estatísticas por categoria
    console.log('\n📊 Estatísticas por categoria:');
    const categories = ['positive', 'neutral', 'negative'];
    for (const category of categories) {
      const count = await commentsCollection.countDocuments({ category });
      console.log(`  ${category}: ${count} comentários`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o script
populateComments().catch(console.error);