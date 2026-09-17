import { useDepartments } from "../context/DepartmentContext";

export default function useDepartmentGate(departmentKey) {
  const { enabledDepartments } = useDepartments();

  return {
    isEnabled: enabledDepartments.includes(departmentKey),
  };
}