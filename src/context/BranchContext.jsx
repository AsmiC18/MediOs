import React, { createContext, useContext, useState } from "react";
import { useAuth } from "./AuthContext";

const BranchContext = createContext(null);

export const BranchProvider = ({ children }) => {
  const { user } = useAuth();

  const branches = user?.branches || [];

  const [activeBranch, setActiveBranch] = useState(
    branches[0] || null
  );

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranch,
        setActiveBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  return useContext(BranchContext);
};