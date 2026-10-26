import React, { createContext, useContext, useState } from "react";

const DepartmentContext = createContext(null);

export const DepartmentProvider = ({ children }) => {
  const [enabledDepartments, setEnabledDepartments] = useState([
    "OPD",
    "IPD",
    "PHARMACY",
    "DIAGNOSTICS",
    "SURGERY",
    "EMERGENCY",
  ]);

  return (
    <DepartmentContext.Provider
      value={{
        enabledDepartments,
        setEnabledDepartments,
      }}
    >
      {children}
    </DepartmentContext.Provider>
  );
};

export const useDepartments = () => useContext(DepartmentContext);