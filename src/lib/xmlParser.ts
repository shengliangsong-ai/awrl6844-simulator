import { XMLParser } from 'fast-xml-parser';

export interface BitfieldDef {
  id: string;
  begin: number;
  end: number;
  width: number;
  rwaccess: string;
  description: string;
}

export interface RegisterDef {
  id: string;
  uniqueId: string;
  acronym: string;
  offset: string;
  width: number;
  description: string;
  bitfields: BitfieldDef[];
}

export interface ModuleDef {
  id: string;
  description: string;
  registers: RegisterDef[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true
});

export function parseRegisterXML(xmlContent: string): ModuleDef | null {
  try {
    const jsonObj = parser.parse(xmlContent);
    const mod = jsonObj.module;
    if (!mod) return null;

    let registersRaw = mod.register;
    if (!registersRaw) {
      registersRaw = [];
    } else if (!Array.isArray(registersRaw)) {
      registersRaw = [registersRaw];
    }

    const registers: RegisterDef[] = registersRaw.map((r: any) => {
      let bitfieldsRaw = r.bitfield;
      if (!bitfieldsRaw) {
        bitfieldsRaw = [];
      } else if (!Array.isArray(bitfieldsRaw)) {
        bitfieldsRaw = [bitfieldsRaw];
      }

      const bitfields: BitfieldDef[] = bitfieldsRaw.map((b: any) => ({
        id: b.id || '',
        begin: parseInt(b.begin, 10),
        end: parseInt(b.end, 10),
        width: parseInt(b.width, 10),
        rwaccess: b.rwaccess || 'RW',
        description: b.description || ''
      }));

      return {
        id: r.id || '',
        uniqueId: (r.id || '') + '_' + (r.offset || '0x0') + '_' + Math.random().toString(36).substr(2, 9),
        acronym: r.acronym || '',
        offset: r.offset || '0x0',
        width: parseInt(r.width || '32', 10),
        description: r.description || '',
        bitfields
      };
    });

    return {
      id: mod.id || '',
      description: mod.description || '',
      registers
    };
  } catch (err) {
    console.error("Error parsing XML", err);
    return null;
  }
}
