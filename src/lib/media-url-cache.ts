type Entry = { objectUrl: string | null; promise: Promise<string | null>; refs: number };

/** A retired request must never overwrite a new entry for the same media key.
 * Chat acknowledgement can remount an image before its first fetch finishes. */
export function createMediaUrlCache(load: (key: string) => Promise<string | null>, revoke: (url: string) => void) {
  const entries = new Map<string, Entry>();
  return {
    acquire(key: string): Promise<string | null> {
      const hit = entries.get(key);
      if (hit) { hit.refs++; return hit.promise; }
      const entry: Entry = {objectUrl:null,promise:load(key),refs:1};
      entries.set(key,entry);
      void entry.promise.then(url=>{
        if(entries.get(key)!==entry){if(url)revoke(url);return;}
        entry.objectUrl=url;
      });
      return entry.promise;
    },
    release(key:string) {
      const entry=entries.get(key);if(!entry)return;
      entry.refs--;if(entry.refs>0)return;
      entries.delete(key);if(entry.objectUrl)revoke(entry.objectUrl);
    },
  };
}
