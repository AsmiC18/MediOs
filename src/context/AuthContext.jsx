import React, { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

const MOCK_USER = {
  id: "U001",
  name: "Dr. Arun Kumar",
  email: "arun@medios.com",
  role: "doctor",

  permissions: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "clinical.view",
    "clinical.edit",
    "whatsapp.inbox.view",
    "whatsapp.inbox.reply",
    "whatsapp.inbox.assign",
    "whatsapp.inbox.resolve",
    "whatsapp.templates.view",
    "whatsapp.templates.manage",
    "whatsapp.broadcasts.view",
    "whatsapp.broadcasts.send",
  ],

  branches: [
    {
      id: "B001",
      name: "MediOS Main Branch",
      location: "Vellore",
    },
  ],
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);

    // Temporary mock authentication.
    // Backend will replace this later.
    await new Promise((resolve) => setTimeout(resolve, 500));

    setUser(MOCK_USER);
    setLoading(false);

    return MOCK_USER;
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        login,
        logout,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);