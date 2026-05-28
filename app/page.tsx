"use client";

import { useEffect, useState } from "react";

import MainLayout from "../src/components/layout/MainLayout";
import LoginPage from "../src/components/login/LoginPage";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  role: "ADMIN" | "STAFF";
  is_active: boolean;
};

export default function Home() {

  const [user, setUser] =
    useState<LoginUser | null>(null);

  useEffect(() => {

    const savedUser =
      localStorage.getItem("erpUser");

    if (!savedUser) {
      return;
    }

    setUser(JSON.parse(savedUser));

  }, []);

  if (!user) {
    return (
      <LoginPage
        onLogin={(loginUser) =>
          setUser(loginUser)
        }
      />
    );
  }

  return (
    <MainLayout
      user={user}
      onLogout={() => {

        localStorage.removeItem("erpUser");

        setUser(null);

      }}
    />
  );
}