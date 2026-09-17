import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";
import { DepartmentProvider } from "./context/DepartmentContext";
import AppRoutes from "./routes/AppRoutes";
import "./styles/index.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BranchProvider>
          <DepartmentProvider>
            <AppRoutes />
          </DepartmentProvider>
        </BranchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
