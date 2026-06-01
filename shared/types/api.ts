export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  speechCount: number;
  sizeLevel: 1 | 2 | 3 | 4;
  profile: string;
  isSupporter: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface LandData {
  id: string;
  ownerId: string;
  ownerUsername: string;
  ownerIsSupporter: boolean;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xPx: number;
  yPx: number;
  createdAt: string;
}

export interface SignData {
  id: string;
  ownerId: string;
  ownerUsername: string;
  x: number;
  y: number;
  xPx: number;
  yPx: number;
  title: string;
  content: string;
  createdAt: string;
}

export interface ApiError {
  error: string;
  message: string;
}
