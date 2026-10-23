import { describe, expect, it } from 'vitest';
import { extrairEspecialistas, lerCabecalho } from './especialistas';

const skill = '---\nname: apuracao-simples-nacional\ndescription: Apura o DAS mensal.\nallowed-tools: Read\n---\n\n# Apuração do Simples Nacional\n\nTabela dos anexos.';
const agente = '---\nname: rescisao-clt-calculo\ndescription: "Especialista em rescisão CLT."\ntools: Read, Grep\nmodel: sonnet\n---\n\nVocê é contador trabalhista.';

describe('pacotes de especialistas', () => {
  it('lê o cabeçalho e tira aspas', () => {
    const r = lerCabecalho(agente);
    expect(r.campos.name).toBe('rescisao-clt-calculo');
    expect(r.campos.description).toBe('Especialista em rescisão CLT.');
    expect(r.corpo.trim()).toBe('Você é contador trabalhista.');
  });

  it('separa skills (com arquivos de apoio) de agentes e ignora README, instalação e a interface', () => {
    const r = extrairEspecialistas([
      { caminho: 'skills-main/skills/01-apuracao-simples-nacional/SKILL.md', texto: skill },
      { caminho: 'skills-main/skills/01-apuracao-simples-nacional/references/anexos.md', texto: '# Anexos\nAnexo I...' },
      { caminho: 'skills-main/README.md', texto: '---\nname: x\ndescription: y\n---\nnão é especialista' },
      { caminho: '57-Agentes/MODELOS/13-rescisao/13-rescisao-clt-calculo.md', texto: agente },
      { caminho: '57-Agentes/MODELOS/13-rescisao/COMO-INSTALAR.md', texto: '---\nname: x\ndescription: y\n---' },
      { caminho: '57-Agentes/interface/node_modules/pkg/doc.md', texto: '---\nname: z\ndescription: w\n---' },
      { caminho: '57-Agentes/manual.html', texto: '<html>' },
    ], 'teste');
    expect(r.map((e) => `${e.tipo}:${e.slug}`)).toEqual(['skill:apuracao-simples-nacional', 'agente:rescisao-clt-calculo']);
    const s = r[0];
    expect(s.nome).toBe('Apuração do Simples Nacional');
    expect(s.descricao).toBe('Apura o DAS mensal.');
    expect(s.conteudo).toContain('Arquivo de apoio: references/anexos.md');
    expect(s.conteudo).not.toContain('allowed-tools');
    expect(r[1].nome).toBe('Rescisao clt calculo');
  });

  it('usa os nomes do catálogo do pacote e tolera sujeira antes do cabeçalho', () => {
    const r = extrairEspecialistas([
      { caminho: 'p/como_usar.md', texto: '### 13 — Rescisão CLT\n**Slug:** `rescisao-clt-calculo`\n' },
      { caminho: 'p/CONTADORES-README.md', texto: '- 01 Simples Nacional · 02 Lucro Presumido\n- 33-36 Conciliações' },
      { caminho: 'p/MODELOS/13-rescisao/13-rescisao-clt-calculo.md', texto: 'E' + agente },
      { caminho: 'p/skills/01-apuracao-simples-nacional/SKILL.md', texto: skill },
    ], 'p');
    expect(r.map((e) => e.nome)).toEqual(['Simples Nacional', 'Rescisão CLT']);
  });

  it('o mesmo especialista repetido fica uma vez só', () => {
    const r = extrairEspecialistas([{ caminho: 'a/x.md', texto: agente }, { caminho: 'b/x.md', texto: agente + '\nmais texto' }], 'p');
    expect(r).toHaveLength(1);
    expect(r[0].conteudo).toContain('mais texto');
  });
});
