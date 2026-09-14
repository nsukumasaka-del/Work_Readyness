export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  targetRole?: string;
  createdAt: string;
  profileCount: number;
}
