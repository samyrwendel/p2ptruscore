// Script para gerar comentários realistas com usuários reais do banco
require('dotenv').config({ path: '.env.development' });
const { MongoClient, ObjectId } = require('mongodb');

// Função para buscar comentários do banco de dados por nível de estrelas
async function getCommentsFromDatabase(commentsCollection, starLevel) {
  try {
    const comments = await commentsCollection.find({ starLevel }).toArray();
    return comments.map(comment => comment.text);
  } catch (error) {
    console.error(`❌ Erro ao buscar comentários para ${starLevel} estrelas:`, error);
    // Fallback para comentários básicos em caso de erro
    const fallbackComments = {
      5: ['Excelente transação!', 'Muito bom!', 'Recomendo!'],
      4: ['Boa transação.', 'Tudo certo.', 'Recomendo.'],
      3: ['Transação normal.', 'Ok.', 'Tudo certo.'],
      2: ['Alguns problemas.', 'Demorou um pouco.', 'Não foi o ideal.'],
      1: ['Transação problemática.', 'Não recomendo.', 'Experiência ruim.']
    };
    return fallbackComments[starLevel] || ['Sem comentário.'];
  }
}

async function generateRealisticComments() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const usersCollection = db.collection('users');
    const karmaCollection = db.collection('karmas');
    const commentsCollection = db.collection('comments');
    
    // Verificar se a coleção de comentários existe e tem dados
    const commentsCount = await commentsCollection.countDocuments();
    console.log(`💬 Comentários disponíveis no banco: ${commentsCount}`);
    
    if (commentsCount === 0) {
      console.log('❌ Não há comentários no banco. Execute primeiro o script populate-comments.js');
      return;
    }
    
    // Buscar usuários reais do banco
    console.log('👥 Buscando usuários reais...');
    const users = await usersCollection.find({}).limit(10).toArray();
    console.log(`📊 Encontrados ${users.length} usuários`);
    
    if (users.length < 2) {
      console.log('❌ Não há usuários suficientes no banco para gerar comentários');
      return;
    }
    
    // Buscar documentos de karma existentes
    console.log('📈 Buscando documentos de karma...');
    const karmaDocuments = await karmaCollection.find({}).toArray();
    console.log(`📊 Encontrados ${karmaDocuments.length} documentos de karma`);
    
    let commentsAdded = 0;
    
    // Para cada documento de karma, adicionar alguns comentários realistas
    for (const karmaDoc of karmaDocuments) {
      const targetUserId = karmaDoc.user;
      
      // Adicionar 3-7 comentários aleatórios
      const numComments = Math.floor(Math.random() * 5) + 3;
      
      for (let i = 0; i < numComments; i++) {
        // Escolher avaliador aleatório (diferente do usuário alvo)
        const evaluators = users.filter(u => !u._id.equals(targetUserId));
        if (evaluators.length === 0) continue;
        
        const evaluator = evaluators[Math.floor(Math.random() * evaluators.length)];
        
        // Escolher estrelas aleatórias (mais peso para 4-5 estrelas)
        const starWeights = [1, 2, 3, 8, 12]; // 1⭐:1, 2⭐:2, 3⭐:3, 4⭐:8, 5⭐:12
        const totalWeight = starWeights.reduce((a, b) => a + b, 0);
        let random = Math.floor(Math.random() * totalWeight);
        let stars = 1;
        
        for (let j = 0; j < starWeights.length; j++) {
          random -= starWeights[j];
          if (random < 0) {
            stars = j + 1;
            break;
          }
        }
        
        // Buscar comentários do banco para o nível de estrelas
        const comments = await getCommentsFromDatabase(commentsCollection, stars);
        const comment = comments[Math.floor(Math.random() * comments.length)];
        
        // Calcular pontos de karma baseado nas estrelas
        const karmaPoints = convertStarsToKarma(stars);
        
        // Criar entrada do histórico
        const historyEntry = {
          timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Últimos 30 dias
          karmaChange: karmaPoints,
          comment: comment,
          evaluator: evaluator._id,
          evaluatorName: evaluator.userName || evaluator.firstName,
          starRating: stars
        };
        
        // Atualizar documento de karma
        await karmaCollection.updateOne(
          { _id: karmaDoc._id },
          {
            $push: { history: historyEntry },
            $inc: { 
              karma: karmaPoints,
              [`stars${stars}`]: 1
            }
          }
        );
        
        commentsAdded++;
      }
    }
    
    console.log(`✅ ${commentsAdded} comentários realistas adicionados!`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

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

// Executar o script
generateRealisticComments().catch(console.error);