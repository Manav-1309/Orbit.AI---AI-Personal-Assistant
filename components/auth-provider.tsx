"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { insforge } from "@/lib/insforge";

interface AuthContextType {
  user: any;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setPhoneUser: (userData: PhoneUserData) => void;
}

interface PhoneUserData {
  id: string;
  name?: string;
  phone: string;
  auth_provider: "phone";
  verification_method: "sms" | "whatsapp";
}

const PHONE_USER_KEY = "omnisync_phone_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const syncUserToDatabase = async (currentUser: any) => {
    try {
      const { data: existingUser, error: fetchError } = await insforge.database
        .from("users")
        .select("id")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (fetchError) {
        console.error("Error checking user in database:", fetchError);
        return;
      }

      if (!existingUser) {
        const displayName = currentUser.profile?.name || currentUser.name || (currentUser.email ? currentUser.email.split("@")[0] : "User");
        const avatarUrl = currentUser.profile?.avatar_url || currentUser.avatar_url || null;
        const now = new Date().toISOString();

        const { error: insertError } = await insforge.database
          .from("users")
          .insert([
            {
              id: currentUser.id,
              email: currentUser.email || null,
              name: displayName,
              avatar_url: avatarUrl,
              auth_provider: "google",
              last_login_at: now,
            },
          ]);

        if (insertError) {
          console.error("Error saving user to database:", insertError);
        } else {
          console.log("Successfully saved user to users table on first sign in.");
        }
      } else {
        // Update last login
        await insforge.database
          .from("users")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", currentUser.id);
      }
    } catch (err) {
      console.error("Failed to sync user database:", err);
    }
  };

  const checkUser = async () => {
    try {
      // First check for a phone-authenticated user in localStorage
      const phoneUserRaw = typeof window !== "undefined" ? localStorage.getItem(PHONE_USER_KEY) : null;
      if (phoneUserRaw) {
        const phoneUser = JSON.parse(phoneUserRaw);
        setUser(phoneUser);
        setLoading(false);
        return;
      }

      // Otherwise check InsForge auth session
      const { data, error } = await insforge.auth.getCurrentUser();
      if (error) {
        console.error("Error getting current user:", error);
        setUser(null);
      } else if (data?.user) {
        await syncUserToDatabase(data.user);

        const { data: dbUser, error: dbError } = await insforge.database
          .from("users")
          .select("*")
          .eq("id", data.user.id)
          .maybeSingle();

        if (dbError) {
          console.error("Error fetching db user record:", dbError);
          setUser(data.user);
        } else if (dbUser) {
          setUser({
            ...data.user,
            profile: {
              ...data.user.profile,
              name: dbUser.name || data.user.profile?.name,
              avatar_url: dbUser.avatar_url || data.user.profile?.avatar_url,
            },
            integrations: dbUser.integrations || {},
          });
        } else {
          setUser(data.user);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Unexpected error checking auth state:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const setPhoneUser = (userData: PhoneUserData) => {
    const enriched = {
      ...userData,
      isPhoneAuth: true,
      profile: {
        name: userData.name || `User ${userData.phone.slice(-4)}`,
      },
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(PHONE_USER_KEY, JSON.stringify(enriched));
    }
    setUser(enriched);
  };

  useEffect(() => {
    checkUser();
  }, []);

  const handleSignOut = async () => {
    try {
      // Clear phone auth session if present
      if (typeof window !== "undefined") {
        localStorage.removeItem(PHONE_USER_KEY);
      }

      const { error } = await insforge.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
      }
    } catch (err) {
      console.error("Sign out threw exception:", err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut: handleSignOut, refreshUser: checkUser, setPhoneUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
