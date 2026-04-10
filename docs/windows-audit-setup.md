# Configuração de Auditoria no Windows Server

Este documento descreve os passos necessários para configurar o Windows Server para que o ADLogs possa coletar eventos de login e acesso a arquivos.

---

## 1. Eventos de Login/Logoff (Configuração Automática)

Os eventos de login (4624, 4625, 4634, 4647) são gerados automaticamente pelo Windows quando:
- A política de auditoria "Logon Events" está habilitada (ativa por padrão na maioria das configurações).

### Verificar se está habilitado

```powershell
# Verificar política de auditoria de logon
auditpol /get /subcategory:"Logon"
```

A saída deve mostrar `Success and Failure` ou ao menos `Success`.

### Habilitar (se necessário)

```powershell
# Habilitar auditoria de logon (sucesso e falha)
auditpol /set /subcategory:"Logon" /success:enable /failure:enable
auditpol /set /subcategory:"Logoff" /success:enable /failure:enable
```

### Alternativa via Group Policy

1. Abrir `gpedit.msc`
2. Navegar: `Computer Configuration > Windows Settings > Security Settings > Advanced Audit Policy Configuration > Logon/Logoff`
3. Habilitar **Audit Logon** e **Audit Logoff** (Success and Failure)

---

## 2. Eventos de Acesso a Arquivos (Requer Configuração Manual)

Para monitorar leitura/escrita/exclusão de arquivos, são necessários **dois passos**:

### Passo 1: Habilitar Política de Auditoria de Acesso a Objetos

```powershell
# Habilitar auditoria de acesso a objetos
auditpol /set /subcategory:"File System" /success:enable /failure:enable
```

Ou via Group Policy:
1. `gpedit.msc` > `Computer Configuration > Windows Settings > Security Settings > Advanced Audit Policy Configuration > Object Access`
2. Habilitar **Audit File System** (Success and Failure)

### Passo 2: Configurar SACLs nas Pastas Monitoradas

Para cada pasta que deseja monitorar, configure a SACL (System Access Control List):

#### Via PowerShell

```powershell
$FolderPath = "C:\Documentos\Projetos"  # Pasta a monitorar

# Obter ACL atual
$acl = Get-Acl -Path $FolderPath

# Criar regra de auditoria: Everyone, All access, This folder, subfolders and files
$auditRule = New-Object System.Security.AccessControl.FileSystemAuditRule(
    "Everyone",                                    # Usuário/Grupo
    "FullControl",                                 # Permissões a auditar
    "ContainerInherit,ObjectInherit",              # Herança
    "None",                                        # Propagação
    "Success,Failure"                              # Tipos de acesso
)

# Aplicar
$acl.SetAuditRule($auditRule)
Set-Acl -Path $FolderPath -AclObject $acl

Write-Host "SACL configurada em: $FolderPath"
```

#### Via Interface Gráfica

1. Clicar com botão direito na pasta → **Propriedades**
2. Aba **Segurança** → **Avançadas**
3. Aba **Auditoria** → **Adicionar**
4. Selecionar: Entidade = `Everyone`, Tipo = `Todos`, Permissões = `Controle Total`
5. OK → Aplicar

### Passo 3: Cadastrar as Pastas no ADLogs

1. Acessar a interface web do ADLogs
2. Menu **Configurações** → **Pastas Monitoradas**
3. Clicar **Adicionar** e informar o caminho exato da pasta
4. O coletor buscará a configuração atualizada no próximo ciclo

---

## 3. Verificação

Após configurar, aguarde o próximo ciclo do coletor (padrão: 30 segundos) e verifique:

```powershell
# Ver eventos de arquivo no Event Viewer
Get-WinEvent -LogName Security -FilterHashtable @{Id=4663} -MaxEvents 10 |
    Select-Object TimeCreated, Message | Format-List
```

No ADLogs, acesse **Acessos a Arquivos** e confirme que os eventos aparecem.

---

## 4. Ambiente de Domínio (AD)

### Logins de Rede vs. Logins Locais

- **Logins interativos** (console, RDP): registrados no servidor local — ✅ coletados automaticamente.
- **Logins de rede** (compartilhamentos, serviços): registrados no servidor local como `Logon Type 3` — ✅ coletados.
- **Autenticação Kerberos** (domínio AD): o evento 4624 é gerado no Domain Controller, **não** na estação de trabalho.

**Solução para ambiente de domínio:**
- Instalar o ADLogs no próprio Domain Controller para capturar todos os logins.
- Ou instalar em cada servidor de arquivo separadamente.

### Políticas de Grupo via GPO

Para aplicar as configurações em todos os servidores via GPO:

1. Abrir **Group Policy Management**
2. Criar nova GPO ou editar existente
3. Aplicar as políticas de auditoria mencionadas acima
4. Vincular a GPO à OU dos servidores

---

## 5. Dimensionamento de Volume

Volumes estimados por servidor (médio porte, ~50 usuários):

| Tipo | Volume/dia | Volume/mês |
|------|------------|------------|
| Login events | 200-500 eventos | 6.000-15.000 |
| File events (1 pasta) | 5.000-50.000 | 150k-1.5M |
| File events (múltiplas) | 50.000+ | 1.5M+ |

**Recomendação:** Para pastas com muitos arquivos (ex: servidores de impressão, repositórios), considere auditar apenas operações específicas (DELETE e WRITE) em vez de FullControl.

---

## 6. Troubleshooting

### Eventos de arquivo não aparecem

1. Verificar se a política está habilitada: `auditpol /get /subcategory:"File System"`
2. Verificar se a SACL está configurada na pasta
3. Verificar se a pasta está cadastrada no ADLogs (Configurações → Pastas Monitoradas)
4. Verificar o log do coletor: `C:\ProgramData\ADLogs\collector.log`

### Coletor offline no dashboard

1. Verificar status do serviço: `Get-Service ADLogsCollector`
2. Ver logs: `Get-Content C:\ProgramData\ADLogs\collector.log -Tail 50`
3. Verificar se o Docker está rodando: `docker compose ps`
4. Verificar conexão com o banco: `Test-NetConnection localhost -Port 5434`

### Muitos eventos duplicados

- O coletor usa `windows_record_id` para deduplicar — verifique se o ID está sendo parseado corretamente nos logs.
