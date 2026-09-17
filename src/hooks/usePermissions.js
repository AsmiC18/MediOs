import { useAuth } from "../context/AuthContext";

export default function usePermissions() {
  const { user } = useAuth();

  const permissions = user?.permissions || [];

  const can = (permission) => {
    return permissions.includes(permission);
  };

  return {
    permissions,
    can,
  };
}