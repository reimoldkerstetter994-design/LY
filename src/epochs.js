import { mpcToGly } from "./cosmology.js";
import { formatCosmicTime, formatMpc } from "./format.js";
import { gyrFromSeconds } from "./timewarp.js";

function yiLy(mpc) {
  return (mpcToGly(mpc) * 10).toFixed(0);
}

export function buildEpochs(cosmos) {
  const p = cosmos.params;
  const epochs = [
    {
      id: "hot",
      name: "热大爆炸",
      tGyr: gyrFromSeconds(1e-32),
      text: "可计算的经典历史从暴胀之后接上。宇宙是近乎均匀的极热辐射等离子体，空间里还没有恒星、原子或原子核。",
    },
    {
      id: "ew",
      name: "电弱相变",
      tGyr: gyrFromSeconds(1e-12),
      text: "温度降到大约 100 GeV 时，弱力与电磁力分开，基本粒子获得质量。更早的温度是按 1/a 外推的示意，电子对湮灭之前并不精确。",
    },
    {
      id: "qcd",
      name: "夸克禁闭",
      tGyr: gyrFromSeconds(1e-5),
      text: "大约十万分之一秒，温度约 150 MeV，夸克被禁闭成质子和中子。宇宙仍是不透明的粒子汤。",
    },
    {
      id: "nu",
      name: "中微子退耦",
      tGyr: gyrFromSeconds(1),
      text: "大约 1 秒，中微子不再与等离子体频繁碰撞，此后自由流动。光子温度仍在 MeV 量级。",
    },
    {
      id: "bbn",
      name: "原初核合成",
      tGyr: gyrFromSeconds(200),
      text: "最初几分钟，质子和中子合成氢、氦与微量锂。今天宇宙里的氦，大部分是在这里造出来的。",
    },
    ...(p.OmegaR > 0
      ? [
          {
            id: "eq",
            name: "物质辐射相当",
            tGyr: cosmos.tEqGyr,
            text: `红移约 ${cosmos.zEq.toFixed(0)}。此后物质密度超过辐射，密度起伏才能在引力下有效生长。`,
          },
        ]
      : []),
    {
      id: "cmb",
      name: "复合",
      tGyr: cosmos.tRecGyr,
      text: `大约 ${formatCosmicTime(cosmos.tRecGyr)}，红移 ${p.zStar.toFixed(0)}。电子与原子核结合成中性原子，光子最后一次散射，成为宇宙微波背景。`,
    },
    {
      id: "dark",
      name: "黑暗时代",
      tGyr: Math.max(cosmos.tRecGyr * 8, 0.01),
      text: "背景辐射已经红移离开可见光，第一批恒星还没点燃。宇宙是暗的，结构仍在线性生长。",
    },
    {
      id: "stars",
      name: "第一代恒星",
      tGyr: 0.18,
      text: "小暗晕里的氢开始聚变。第一代大质量恒星结束黑暗时代，并开始用紫外光影响周围的气体。",
    },
    {
      id: "re",
      name: "再电离",
      tGyr: cosmos.tReGyr,
      text: `普朗克测得再电离中点约 z = ${p.zRe.toFixed(1)}，在这个宇宙模型里大约是 ${formatCosmicTime(cosmos.tReGyr)}。恒星和早期黑洞把星系际氢再次电离。`,
    },
    {
      id: "peak",
      name: "恒星形成高峰",
      tGyr: cosmos.sampleA(1 / 3).tGyr,
      text: "大约 z = 2。宇宙的恒星形成率达到最高，今天看到的大星系正在迅速组装。",
    },
  ];

  if (Number.isFinite(cosmos.aLambda) && cosmos.aLambda < 1) {
    epochs.push({
      id: "de",
      name: "暗能量主导",
      tGyr: cosmos.sampleA(cosmos.aLambda).tGyr,
      text: "暗能量密度超过物质，膨胀由减速转为加速。遥远星系此后越来越快地退行。",
    });
  }

  const sun = cosmos.ageGyr - 4.567;
  if (sun > 0.5 && sun < cosmos.ageGyr) {
    epochs.push({
      id: "sun",
      name: "太阳诞生",
      tGyr: sun,
      text: "距今 45.7 亿年，太阳在银河系盘里的一团分子云中形成。地球上的地质史从此开始。",
    });
  }

  epochs.push({
    id: "now",
    name: "今天",
    tGyr: cosmos.ageGyr,
    text: `宇宙年龄 ${formatCosmicTime(cosmos.ageGyr)}。粒子视界 ${formatMpc(cosmos.horizonNowMpc)}（约 ${yiLy(cosmos.horizonNowMpc)} 亿光年），微波背景 ${p.T0.toFixed(3)} K。`,
  });

  return epochs
    .filter((e) => e.tGyr > 0 && e.tGyr <= cosmos.ageGyr * 1.0001)
    .sort((a, b) => a.tGyr - b.tGyr);
}

export function nearestEpoch(epochs, tGyr) {
  let best = epochs[0];
  let score = Infinity;
  for (const e of epochs) {
    const s = Math.abs(Math.log(Math.max(tGyr, 1e-40)) - Math.log(Math.max(e.tGyr, 1e-40)));
    if (s < score) {
      score = s;
      best = e;
    }
  }
  return best;
}
