"use client";
import { createContext, useContext } from "react";
import Link from "next/link";
import { PrototypeIcon } from "@/components/prototype/frame";
export const NotificationCountsContext = createContext({alerts:0,chat:0,likes:0});
export function NotificationLink({icon="bell"}:{icon?:"bell"|"heart"}) {
  const {alerts} = useContext(NotificationCountsContext);
  return <Link href="/app/notifications" className="disc-heart" aria-label="Notifications"><PrototypeIcon name={icon}/>{alerts > 0 && <span className="badge" role="status" aria-label={`${alerts} unread notifications`}>{alerts > 99 ? '99+' : alerts}</span>}</Link>;
}
