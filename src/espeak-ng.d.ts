declare module 'espeak-ng' {
  interface ESpeakModule {
    FS: {
      readFile(path: string): Uint8Array
    }
  }

  interface ESpeakOptions {
    arguments: string[]
    locateFile?: (path: string, prefix: string) => string
  }

  export default function createESpeak(options: ESpeakOptions): Promise<ESpeakModule>
}
