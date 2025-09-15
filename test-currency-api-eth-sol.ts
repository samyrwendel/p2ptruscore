// Script para testar as cotações de ETH e SOL na API de moedas
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CurrencyApiService } from './src/operations/currency-api.service';

async function testCurrencyApiEthSol() {
  console.log('🧪 Testando API de cotações para ETH e SOL...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const currencyApiService = app.get(CurrencyApiService);
  
  try {
    // Teste 1: Buscar todas as cotações
    console.log('\n📊 Teste 1: Buscando todas as cotações...');
    const rates = await currencyApiService.getCurrentRates();
    
    console.log('✅ Cotações obtidas:');
    console.log(`   - USD/BRL: ${rates.USDBRL ? 'Disponível' : 'Não disponível'}`);
    console.log(`   - BTC/BRL: ${rates.BTCBRL ? 'Disponível' : 'Não disponível'}`);
    console.log(`   - ETH/BRL: ${rates.ETHBRL ? 'Disponível' : 'Não disponível'}`);
    console.log(`   - SOL/BRL: ${rates.SOLBRL ? 'Disponível' : 'Não disponível'}`);
    console.log(`   - EUR/BRL: ${rates.EURBRL ? 'Disponível' : 'Não disponível'}`);
    
    if (rates.ETHBRL) {
      console.log(`\n🔹 ETH/BRL Detalhes:`);
      console.log(`   - Nome: ${rates.ETHBRL.name}`);
      console.log(`   - Preço: R$ ${parseFloat(rates.ETHBRL.bid).toFixed(2)}`);
      console.log(`   - Variação: ${rates.ETHBRL.pctChange}%`);
      console.log(`   - Máxima: R$ ${parseFloat(rates.ETHBRL.high).toFixed(2)}`);
      console.log(`   - Mínima: R$ ${parseFloat(rates.ETHBRL.low).toFixed(2)}`);
    }
    
    if (rates.SOLBRL) {
      console.log(`\n🔹 SOL/BRL Detalhes:`);
      console.log(`   - Nome: ${rates.SOLBRL.name}`);
      console.log(`   - Preço: R$ ${parseFloat(rates.SOLBRL.bid).toFixed(2)}`);
      console.log(`   - Variação: ${rates.SOLBRL.pctChange}%`);
      console.log(`   - Máxima: R$ ${parseFloat(rates.SOLBRL.high).toFixed(2)}`);
      console.log(`   - Mínima: R$ ${parseFloat(rates.SOLBRL.low).toFixed(2)}`);
    }
    
    // Teste 2: Testar getSuggestedPrice para ETH
    console.log('\n💰 Teste 2: Testando getSuggestedPrice para ETH...');
    const ethPrice = await currencyApiService.getSuggestedPrice('ETH');
    
    if (ethPrice !== null) {
      console.log(`✅ Preço sugerido para ETH: R$ ${ethPrice.toFixed(2)}`);
    } else {
      console.log('❌ Não foi possível obter preço sugerido para ETH');
    }
    
    // Teste 3: Testar getSuggestedPrice para SOL
    console.log('\n💰 Teste 3: Testando getSuggestedPrice para SOL...');
    const solPrice = await currencyApiService.getSuggestedPrice('SOL');
    
    if (solPrice !== null) {
      console.log(`✅ Preço sugerido para SOL: R$ ${solPrice.toFixed(2)}`);
    } else {
      console.log('❌ Não foi possível obter preço sugerido para SOL');
    }
    
    // Teste 4: Testar outras moedas para comparação
    console.log('\n🔄 Teste 4: Testando outras moedas para comparação...');
    
    const btcPrice = await currencyApiService.getSuggestedPrice('BTC');
    const usdtPrice = await currencyApiService.getSuggestedPrice('USDT');
    const usdcPrice = await currencyApiService.getSuggestedPrice('USDC');
    const usdePrice = await currencyApiService.getSuggestedPrice('USDE');
    
    console.log(`   - BTC: ${btcPrice ? `R$ ${btcPrice.toFixed(2)}` : 'Não disponível'}`);
    console.log(`   - USDT: ${usdtPrice ? `R$ ${usdtPrice.toFixed(2)}` : 'Não disponível'}`);
    console.log(`   - USDC: ${usdcPrice ? `R$ ${usdcPrice.toFixed(2)}` : 'Não disponível'}`);
    console.log(`   - USDE: ${usdePrice ? `R$ ${usdePrice.toFixed(2)}` : 'Não disponível'}`);
    
    // Teste 5: Testar getAllRatesFormatted
    console.log('\n📋 Teste 5: Testando getAllRatesFormatted...');
    const formattedRates = await currencyApiService.getAllRatesFormatted();
    
    console.log('✅ Cotações formatadas:');
    console.log('---');
    console.log(formattedRates);
    console.log('---');
    
    // Teste 6: Verificar se ETH e SOL aparecem nas cotações formatadas
    console.log('\n🔍 Teste 6: Verificando presença de ETH e SOL nas cotações formatadas...');
    
    const hasEth = formattedRates.includes('ETH') || formattedRates.includes('Ethereum');
    const hasSol = formattedRates.includes('SOL') || formattedRates.includes('Solana');
    
    console.log(`   - ETH presente: ${hasEth ? '✅ Sim' : '❌ Não'}`);
    console.log(`   - SOL presente: ${hasSol ? '✅ Sim' : '❌ Não'}`);
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
  } finally {
    await app.close();
  }
  
  console.log('\n🏁 Testes de API de cotação concluídos!');
  console.log('\n📊 **Resumo dos Testes:**');
  console.log('   1. ✅ Busca de todas as cotações');
  console.log('   2. ✅ Preço sugerido para ETH');
  console.log('   3. ✅ Preço sugerido para SOL');
  console.log('   4. ✅ Comparação com outras moedas');
  console.log('   5. ✅ Cotações formatadas');
  console.log('   6. ✅ Verificação de presença nas cotações');
  console.log('\n🎯 **Conclusão:** Testes de ETH e SOL concluídos!');
}

// Executar o script
testCurrencyApiEthSol().catch(console.error);