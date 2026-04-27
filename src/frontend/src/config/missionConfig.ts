export type MissionId = "M1" | "M2" | "M3" | "M4" | "M5";

export interface MissionDefinition {
  id: MissionId;
  name: string;
  objective: string;
  hint: string;
}

export const missionDefinitions: MissionDefinition[] = [
  {
    id: "M1",
    name: "地球の周回軌道に乗る",
    objective: "ロケットを地球周回に安定投入する",
    hint: "低すぎる速度は落下、高すぎる速度は脱出になりやすい",
  },
  {
    id: "M2",
    name: "地球から脱出",
    objective: "地球重力圏から十分離脱する",
    hint: "角度よりも初速度の影響が大きい",
  },
  {
    id: "M3",
    name: "地球から月を周回",
    objective: "月周回軌道へ遷移し維持する",
    hint: "地球離脱後の進入角を調整する",
  },
  {
    id: "M4",
    name: "地球から火星を周回",
    objective: "火星近傍で捕捉される軌道を作る",
    hint: "長距離移動では時間倍率を活用する",
  },
  {
    id: "M5",
    name: "地球から金星を周回",
    objective: "金星近傍で安定周回に入る",
    hint: "重力井戸への入り方を意識する",
  },
];

export const defaultMissionId: MissionId = "M1";
export const defaultUnlockedMissionIds: MissionId[] = ["M1", "M2"];

export function getMissionById(id: MissionId): MissionDefinition {
  return missionDefinitions.find((mission) => mission.id === id) ?? missionDefinitions[0];
}
