"use client";

import type { ElementType } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface Service {
  number: string;
  title: string;
  description: string;
  icon: ElementType;
  gradient: string;
}

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  const Icon = service.icon;
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: index * 0.1,
      },
    },
  };

  return (
    <motion.div
      variants={cardVariants}
      className={cn(
        "relative flex h-[min(16.7rem,calc((100dvh-10rem)*5/6))] w-full flex-col justify-between overflow-hidden rounded-2xl p-4",
        service.gradient,
      )}
    >
      <div className="z-10 flex min-h-0 flex-1 flex-col items-start text-left">
        <span className="mb-4 font-mono text-xs text-foreground/50">( {service.number} )</span>
        <Icon className="mb-auto h-6 w-6 text-foreground" />
      </div>
      <div className="z-10">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider">{service.title}</h3>
        <p className="text-xs leading-5 text-foreground/70">{service.description}</p>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070c]/20 to-transparent [[data-theme=light]_&]:from-transparent" />
    </motion.div>
  );
}
