"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if there's an invite/recovery hash fragment in the URL
    // If so, redirect to /auth with the hash fragment
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      
      if (type === 'invite' || type === 'recovery') {
        // Redirect to /auth with the hash fragment
        router.replace(`/auth${hash}`);
        return;
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
}

