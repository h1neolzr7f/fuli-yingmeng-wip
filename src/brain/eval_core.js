/**
 * eval_core.js - CEM 适应度评估核心（主进程与 worker_threads 共用，零依赖）
 *
 * 从 train.js 抽出，语义保持逐位一致：
 * 适应度 = 存活帧数 + 擦弹×4 − 贴墙惩罚(0.25/帧) − 偏心惩罚(0.35×|x−cx|/cx)
 */

import { DanmakuGame } from '../game/danmaku.js';
import { ReadoutPolicy } from './policy.js';

/**
 * 评估单个参数候选人在 DanmakuGame 中的适应度表现
 * 跨越不同符卡与种子，考察策略的泛化避障能力
 */
export function evaluateCandidate(weights, seeds, brain, maxFrames = 1200) {
  let totalScore = 0;
  const policy = new ReadoutPolicy(weights);
  // v7: 322 参数向量时第 321/322 位是 DN 兴奋/抑制全局增益 (作用在 connectome 侧)。
  brain.applyDnGains(weights.length > 320 ? weights[320] : 1, weights.length > 320 ? weights[321] : 1);

  for (let s = 0; s < seeds.length; s++) {
    const seed = seeds[s];
    const NC = Number(process.env.CARDS || 3); const spellcard = s % NC; // 轮替符卡 0(漫天环状+自机狙), 1(高密狙+微弹), 2(双向螺旋+高速狙)
    brain.reset();

    const game = new DanmakuGame(null, { width: 460, height: 580, seed, fixedMult: Number(process.env.HARD_MULT || 0), bossVision: !!process.env.FIERCE, freeMove: !!process.env.FIERCE });
    game.setSpellcard(spellcard);
    const LIVES = Number(process.env.LIVES || 1);
    game.player.lives = LIVES;
    game.player.maxLives = LIVES;
    game.player.autoRespawn = false;
    game.player.invulnerableTimer = 0;

    let frames = 0;
    let killF = -1;
    let aligned = 0;
    let wallPenalty = 0;
    let centeringPenalty = 0;
    const centerX = game.width / 2;

    while (!game.player.isDead && frames < maxFrames) {
      const obs = game.getBiologicalSensoryInput();
      const dn = brain.step(obs, false);
      const motor = policy.forward(dn);
      game.update(motor);
      frames++;
      if (killF < 0 && game.boss.hp <= 0) killF = frames;
      if (!game.player.isDead && Math.abs(game.boss.x - game.player.x) < 20) aligned++;

      // 1. 贴墙挂机惩罚 (左右边距 < 32 像素)
      if (game.player.x < 32 || game.player.x > game.width - 32) {
        wallPenalty += 0.25;
      }

      // 2. 连续居中引导惩罚 (中心偏差 0.0 ~ 1.0, 系数 0.35)
      // 0=正中(230px), 1=最边缘(0px 或 460px)。粉碎躲角偏边偷懒解
      const centerDistX = Math.abs(game.player.x - centerX) / centerX;
      centeringPenalty += centerDistX * 0.35;
    }

    // 适应度 = 存活帧数 + 擦弹奖励 (激励主动贴弹穿越走位) - 靠墙惩罚 - 偏心惩罚
    const dmg = game.boss.maxHp - game.boss.hp;
    const DW = Number(process.env.DMG_W || 0);
    const SW = Number(process.env.SCORE_W || 0);
    const GRAZE_CAP = Number(process.env.GRAZE_CAP || 0); // 0 = ignore graze; else min(graze,CAP)*GRAZE_W
    const GRAZE_W = Number(process.env.GRAZE_W || 0);
    const grazeTerm = GRAZE_CAP > 0 ? Math.min(game.player.graze, GRAZE_CAP) * GRAZE_W : 0;
    // Score from hits/clear only: game awards +50/graze +10/hit +10000/clear — strip graze points when GRAZE_STRIP=1
    const scoreClean = process.env.GRAZE_STRIP ? Math.max(0, game.player.score - game.player.graze * 50) : game.player.score;
    const fitness = frames + grazeTerm + DW * dmg + SW * scoreClean + (killF > 0 ? Number(process.env.KILL_BONUS || 0) + (1800 - killF) : 0) + Number(process.env.ALIGN_W || 0) * aligned - wallPenalty - (DW > 0 ? 0 : centeringPenalty);
    totalScore += Math.max(1, fitness);
  }

  return totalScore / seeds.length;
}
