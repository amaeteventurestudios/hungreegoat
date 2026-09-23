import { SongDetail } from "@/components/domain/song-pages";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SongDetail id={id}/>;}
