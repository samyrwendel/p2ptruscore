/**
 * Utilitários para cálculo de reputação e níveis de confiança
 * Centraliza a lógica de níveis para evitar duplicação de código
 */

import { getReputationInfo as getConfigReputationInfo } from './karma-config.utils';

export interface ReputationInfo {
  nivel: string;
  icone: string;
  score: number;
}

/**
 * Calcula o nível de reputação baseado na pontuação
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação (nível, ícone, score)
 */
export function getReputationInfo(karma: any): ReputationInfo {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  const configInfo = getConfigReputationInfo(score);
  
  return { 
    nivel: configInfo.name, 
    icone: configInfo.icon, 
    score 
  };
}

/**
 * Calcula o nível de reputação com emojis alternativos (para compatibilidade)
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação com emojis alternativos
 */
export function getReputationInfoAlt(karma: any): { nivel: string; emoji: string; score: number } {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  const configInfo = getConfigReputationInfo(score);
  
  // Mapeamento para emojis alternativos
  const altEmojis = {
    'Problemático': '🔴',
    'Iniciante': '▼',
    'Bronze': '▲',
    'Prata': '■',
    'Ouro': '♦',
    'Mestre P2P': '●'
  };
  
  return { 
    nivel: configInfo.name, 
    emoji: altEmojis[configInfo.name] || '▼', 
    score 
  };
}

/**
 * Calcula o nível de reputação com emojis coloridos (para hello/bora handlers)
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação com emojis coloridos
 */
export function getReputationInfoColored(karma: any): { nivel: string; emoji: string; score: number } {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  const configInfo = getConfigReputationInfo(score);
  
  // Mapeamento para emojis coloridos
  const coloredEmojis = {
    'Problemático': '🔴',
    'Iniciante': '🔴',
    'Bronze': '🟡',
    'Prata': '🟢',
    'Ouro': '🟢',
    'Mestre P2P': '💎'
  };
  
  return { 
    nivel: configInfo.name, 
    emoji: coloredEmojis[configInfo.name] || '🔴', 
    score 
  };
}