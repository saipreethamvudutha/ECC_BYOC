/**
 * CIS v8.1 Linux Benchmark Control Registry
 * 55 Linux-applicable controls across 6 families.
 * Reference: CIS Red Hat Enterprise Linux / Ubuntu Linux Benchmark v8.1
 */

export interface CisControl {
  id: string;        // e.g. "5.2.4"
  level: 1 | 2;     // CIS benchmark level
  title: string;    // Short control title
  family: string;   // "filesystem" | "services" | "network" | "logging" | "access" | "maintenance"
  description: string;
  remediation: string;
}

export const CIS_V81_CONTROLS: Record<string, CisControl> = {

  // ═══════════════════════════════════════════════════════════════
  // 1.x — Initial Setup / Filesystem
  // ═══════════════════════════════════════════════════════════════

  '1.1.1': {
    id: '1.1.1', level: 1, family: 'filesystem',
    title: 'Ensure /tmp is a separate partition',
    description: '/tmp should be mounted on a separate partition to prevent runaway processes from filling root.',
    remediation: 'Configure a dedicated partition or tmpfs for /tmp in /etc/fstab.',
  },
  '1.1.2': {
    id: '1.1.2', level: 1, family: 'filesystem',
    title: 'Ensure nodev option on /tmp',
    description: 'The nodev mount option prevents device files from being created on /tmp.',
    remediation: 'Add nodev to /tmp mount options in /etc/fstab.',
  },
  '1.1.3': {
    id: '1.1.3', level: 1, family: 'filesystem',
    title: 'Ensure nosuid option on /tmp',
    description: 'The nosuid mount option prevents SUID bit from being honored on /tmp.',
    remediation: 'Add nosuid to /tmp mount options in /etc/fstab.',
  },
  '1.1.4': {
    id: '1.1.4', level: 1, family: 'filesystem',
    title: 'Ensure noexec option on /tmp',
    description: 'The noexec mount option prevents executables from running directly from /tmp.',
    remediation: 'Add noexec to /tmp mount options in /etc/fstab.',
  },
  '1.1.5': {
    id: '1.1.5', level: 1, family: 'filesystem',
    title: 'Ensure nodev option on /var/tmp',
    description: 'The nodev mount option prevents device files on /var/tmp.',
    remediation: 'Add nodev to /var/tmp mount options in /etc/fstab.',
  },
  '1.1.6': {
    id: '1.1.6', level: 1, family: 'filesystem',
    title: 'Ensure nosuid option on /var/tmp',
    description: 'The nosuid mount option prevents SUID bit on /var/tmp.',
    remediation: 'Add nosuid to /var/tmp mount options in /etc/fstab.',
  },
  '1.1.7': {
    id: '1.1.7', level: 1, family: 'filesystem',
    title: 'Ensure noexec option on /var/tmp',
    description: 'The noexec mount option prevents executables from /var/tmp.',
    remediation: 'Add noexec to /var/tmp mount options in /etc/fstab.',
  },
  '1.1.8': {
    id: '1.1.8', level: 1, family: 'filesystem',
    title: 'Ensure nodev option on /dev/shm',
    description: 'The nodev mount option prevents device files on shared memory.',
    remediation: 'Add nodev to /dev/shm mount options in /etc/fstab.',
  },
  '1.1.9': {
    id: '1.1.9', level: 1, family: 'filesystem',
    title: 'Ensure nosuid option on /dev/shm',
    description: 'The nosuid mount option prevents SUID execution from shared memory.',
    remediation: 'Add nosuid to /dev/shm mount options in /etc/fstab.',
  },
  '1.1.10': {
    id: '1.1.10', level: 1, family: 'filesystem',
    title: 'Ensure noexec option on /dev/shm',
    description: 'The noexec mount option prevents code execution from /dev/shm.',
    remediation: 'Add noexec to /dev/shm mount options in /etc/fstab.',
  },
  '1.1.22': {
    id: '1.1.22', level: 1, family: 'filesystem',
    title: 'Ensure sticky bit on world-writable directories',
    description: 'World-writable directories should have the sticky bit set to prevent arbitrary deletion.',
    remediation: 'Run: find / -xdev -type d -perm -0002 -a ! -perm -1000 | xargs chmod +t',
  },
  '1.9': {
    id: '1.9', level: 1, family: 'filesystem',
    title: 'Ensure system patches are up to date',
    description: 'Keeping OS packages patched reduces exposure to known vulnerabilities.',
    remediation: 'Run package manager update: apt upgrade -y or yum update -y',
  },

  // ═══════════════════════════════════════════════════════════════
  // 2.x — Services
  // ═══════════════════════════════════════════════════════════════

  '2.1.1': {
    id: '2.1.1', level: 1, family: 'services',
    title: 'Ensure xinetd is not installed',
    description: 'xinetd is an extended internet services daemon; attack surface if running.',
    remediation: 'apt remove xinetd or yum remove xinetd',
  },
  '2.1.2': {
    id: '2.1.2', level: 1, family: 'services',
    title: 'Ensure avahi-daemon is not enabled',
    description: 'Avahi enables zeroconf service discovery which may expose the host.',
    remediation: 'systemctl disable avahi-daemon && systemctl stop avahi-daemon',
  },
  '2.1.3': {
    id: '2.1.3', level: 1, family: 'services',
    title: 'Ensure CUPS is not enabled',
    description: 'CUPS (printing) is unnecessary on servers and expands attack surface.',
    remediation: 'systemctl disable cups && systemctl stop cups',
  },
  '2.2.1': {
    id: '2.2.1', level: 1, family: 'services',
    title: 'Ensure unnecessary services are disabled',
    description: 'Unnecessary services increase the attack surface of the system.',
    remediation: 'Disable all services not required for system function using systemctl disable.',
  },
  '2.3.1': {
    id: '2.3.1', level: 1, family: 'services',
    title: 'Ensure NIS client is not installed',
    description: 'NIS is an insecure authentication system that should not be used.',
    remediation: 'apt remove nis or yum remove ypbind',
  },
  '2.3.4': {
    id: '2.3.4', level: 1, family: 'services',
    title: 'Ensure rsync service is not enabled',
    description: 'The rsync daemon can expose data if misconfigured.',
    remediation: 'systemctl disable rsync && systemctl stop rsync',
  },

  // ═══════════════════════════════════════════════════════════════
  // 3.x — Network Parameters
  // ═══════════════════════════════════════════════════════════════

  '3.1.1': {
    id: '3.1.1', level: 1, family: 'network',
    title: 'Ensure IP forwarding is disabled',
    description: 'IP forwarding should be disabled on non-router systems.',
    remediation: 'Set net.ipv4.ip_forward = 0 in /etc/sysctl.conf',
  },
  '3.1.2': {
    id: '3.1.2', level: 1, family: 'network',
    title: 'Ensure packet redirect sending is disabled',
    description: 'ICMP redirects can be used in routing attacks.',
    remediation: 'Set net.ipv4.conf.all.send_redirects = 0 in /etc/sysctl.conf',
  },
  '3.2.1': {
    id: '3.2.1', level: 1, family: 'network',
    title: 'Ensure source routed packets are not accepted',
    description: 'Source routing allows packets to override normal routing.',
    remediation: 'Set net.ipv4.conf.all.accept_source_route = 0 in /etc/sysctl.conf',
  },
  '3.2.2': {
    id: '3.2.2', level: 1, family: 'network',
    title: 'Ensure ICMP redirects are not accepted',
    description: 'ICMP redirect messages can be used to redirect traffic.',
    remediation: 'Set net.ipv4.conf.all.accept_redirects = 0 in /etc/sysctl.conf',
  },
  '3.2.4': {
    id: '3.2.4', level: 1, family: 'network',
    title: 'Ensure suspicious packets are logged',
    description: 'Log martian packets (impossible source addresses).',
    remediation: 'Set net.ipv4.conf.all.log_martians = 1 in /etc/sysctl.conf',
  },
  '3.3.1': {
    id: '3.3.1', level: 1, family: 'network',
    title: 'Ensure TCP SYN cookies are enabled',
    description: 'SYN cookies protect against SYN flood DoS attacks.',
    remediation: 'Set net.ipv4.tcp_syncookies = 1 in /etc/sysctl.conf',
  },
  '3.4.1': {
    id: '3.4.1', level: 2, family: 'network',
    title: 'Ensure IPv6 router advertisements are not accepted',
    description: 'IPv6 router advertisements can be exploited for traffic interception.',
    remediation: 'Set net.ipv6.conf.all.accept_ra = 0 in /etc/sysctl.conf',
  },

  // ═══════════════════════════════════════════════════════════════
  // 4.x — Logging and Auditing
  // ═══════════════════════════════════════════════════════════════

  '4.1.1': {
    id: '4.1.1', level: 2, family: 'logging',
    title: 'Ensure auditd is installed',
    description: 'The auditd daemon provides system call auditing.',
    remediation: 'apt install auditd audispd-plugins or yum install audit',
  },
  '4.1.2': {
    id: '4.1.2', level: 2, family: 'logging',
    title: 'Ensure auditd service is enabled',
    description: 'The auditd service must be running to collect audit events.',
    remediation: 'systemctl enable auditd && systemctl start auditd',
  },
  '4.1.3': {
    id: '4.1.3', level: 2, family: 'logging',
    title: 'Ensure auditing for processes starting before auditd',
    description: 'audit=1 kernel parameter ensures early-boot events are captured.',
    remediation: 'Add audit=1 to GRUB_CMDLINE_LINUX in /etc/default/grub',
  },
  '4.1.4': {
    id: '4.1.4', level: 2, family: 'logging',
    title: 'Ensure events that modify date and time information are collected',
    description: 'Changes to system time should be audited.',
    remediation: 'Add audit rules for adjtimex, settimeofday, stime, clock_settime syscalls.',
  },
  '4.1.6': {
    id: '4.1.6', level: 2, family: 'logging',
    title: 'Ensure events that modify user/group information are collected',
    description: 'Changes to /etc/passwd, /etc/shadow, /etc/group should be audited.',
    remediation: 'Add -w /etc/passwd -p wa -k identity audit rules.',
  },
  '4.1.7': {
    id: '4.1.7', level: 2, family: 'logging',
    title: 'Ensure events that modify the network environment are collected',
    description: 'Changes to /etc/hosts, network config should be audited.',
    remediation: 'Add -w /etc/hosts -p wa -k system-locale audit rules.',
  },
  '4.1.10': {
    id: '4.1.10', level: 2, family: 'logging',
    title: 'Ensure discretionary access control permission modification events are collected',
    description: 'chmod, chown, setxattr calls should be audited.',
    remediation: 'Add audit rules for chmod, fchmod, fchmodat, chown, lchown syscalls.',
  },
  '4.1.17': {
    id: '4.1.17', level: 2, family: 'logging',
    title: 'Ensure the audit configuration is immutable',
    description: 'Audit rules should be immutable (require reboot to change).',
    remediation: 'Add -e 2 as the last line of /etc/audit/rules.d/audit.rules',
  },
  '4.2.1': {
    id: '4.2.1', level: 1, family: 'logging',
    title: 'Ensure rsyslog is installed',
    description: 'rsyslog provides system logging capabilities.',
    remediation: 'apt install rsyslog or yum install rsyslog',
  },
  '4.2.2': {
    id: '4.2.2', level: 1, family: 'logging',
    title: 'Ensure rsyslog service is enabled',
    description: 'rsyslog should be running to collect system logs.',
    remediation: 'systemctl enable rsyslog && systemctl start rsyslog',
  },

  // ═══════════════════════════════════════════════════════════════
  // 5.x — Access, Authentication and Authorization
  // ═══════════════════════════════════════════════════════════════

  '5.1.1': {
    id: '5.1.1', level: 1, family: 'access',
    title: 'Ensure cron daemon is enabled',
    description: 'The cron daemon manages scheduled tasks.',
    remediation: 'systemctl enable cron (or crond) && systemctl start cron',
  },
  '5.1.2': {
    id: '5.1.2', level: 1, family: 'access',
    title: 'Ensure permissions on /etc/crontab are configured',
    description: '/etc/crontab should be root:root 600.',
    remediation: 'chown root:root /etc/crontab && chmod 600 /etc/crontab',
  },
  '5.1.8': {
    id: '5.1.8', level: 1, family: 'access',
    title: 'Ensure at/cron is restricted to authorized users',
    description: 'cron.allow and at.allow should exist and restrict access.',
    remediation: 'Create /etc/cron.allow and /etc/at.allow with only authorized users.',
  },
  '5.2.1': {
    id: '5.2.1', level: 1, family: 'access',
    title: 'Ensure permissions on /etc/ssh/sshd_config are configured',
    description: 'sshd_config should be root:root 600.',
    remediation: 'chown root:root /etc/ssh/sshd_config && chmod 600 /etc/ssh/sshd_config',
  },
  '5.2.2': {
    id: '5.2.2', level: 1, family: 'access',
    title: 'Ensure SSH Protocol version is 2',
    description: 'SSH Protocol 1 has known vulnerabilities.',
    remediation: 'Ensure Protocol 2 is set in /etc/ssh/sshd_config.',
  },
  '5.2.4': {
    id: '5.2.4', level: 1, family: 'access',
    title: 'Ensure SSH MaxAuthTries is set to 4 or less',
    description: 'Limiting MaxAuthTries reduces brute-force risk.',
    remediation: 'Set MaxAuthTries 4 in /etc/ssh/sshd_config',
  },
  '5.2.5': {
    id: '5.2.5', level: 1, family: 'access',
    title: 'Ensure SSH IgnoreRhosts is enabled',
    description: 'rhosts files are a security risk and should be ignored.',
    remediation: 'Set IgnoreRhosts yes in /etc/ssh/sshd_config',
  },
  '5.2.6': {
    id: '5.2.6', level: 1, family: 'access',
    title: 'Ensure SSH HostbasedAuthentication is disabled',
    description: 'Host-based authentication is insecure.',
    remediation: 'Set HostbasedAuthentication no in /etc/ssh/sshd_config',
  },
  '5.2.7': {
    id: '5.2.7', level: 1, family: 'access',
    title: 'Ensure SSH root login is disabled',
    description: 'Direct root login via SSH should not be permitted.',
    remediation: 'Set PermitRootLogin no in /etc/ssh/sshd_config',
  },
  '5.2.8': {
    id: '5.2.8', level: 1, family: 'access',
    title: 'Ensure SSH PermitEmptyPasswords is disabled',
    description: 'Empty password accounts must not be accessible via SSH.',
    remediation: 'Set PermitEmptyPasswords no in /etc/ssh/sshd_config',
  },
  '5.2.10': {
    id: '5.2.10', level: 1, family: 'access',
    title: 'Ensure SSH LoginGraceTime is set to one minute or less',
    description: 'Limiting login grace time reduces exposure to connection-based attacks.',
    remediation: 'Set LoginGraceTime 60 in /etc/ssh/sshd_config',
  },
  '5.2.11': {
    id: '5.2.11', level: 1, family: 'access',
    title: 'Ensure only approved ciphers are used',
    description: 'Weak SSH ciphers allow traffic decryption.',
    remediation: 'Set Ciphers aes128-ctr,aes192-ctr,aes256-ctr,aes128-gcm@openssh.com,aes256-gcm@openssh.com in sshd_config',
  },
  '5.2.12': {
    id: '5.2.12', level: 1, family: 'access',
    title: 'Ensure only approved MAC algorithms are used',
    description: 'Weak MAC algorithms allow message forgery.',
    remediation: 'Set MACs hmac-sha2-256,hmac-sha2-512,hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com',
  },
  '5.2.13': {
    id: '5.2.13', level: 1, family: 'access',
    title: 'Ensure only approved key exchange algorithms are used',
    description: 'Weak key exchange algorithms reduce session security.',
    remediation: 'Set KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group14-sha256 in sshd_config',
  },
  '5.2.15': {
    id: '5.2.15', level: 1, family: 'access',
    title: 'Ensure SSH warning banner is configured',
    description: 'Legal banners deter unauthorized access and provide evidence in legal proceedings.',
    remediation: 'Set Banner /etc/issue.net in /etc/ssh/sshd_config',
  },
  '5.3.1': {
    id: '5.3.1', level: 1, family: 'access',
    title: 'Ensure sudo is installed',
    description: 'Sudo provides a mechanism for fine-grained privilege escalation.',
    remediation: 'apt install sudo or yum install sudo',
  },
  '5.3.4': {
    id: '5.3.4', level: 1, family: 'access',
    title: 'Ensure sudo use_pty is enabled',
    description: 'use_pty prevents privilege escalation via background processes.',
    remediation: 'Add Defaults use_pty to /etc/sudoers',
  },
  '5.3.5': {
    id: '5.3.5', level: 1, family: 'access',
    title: 'Ensure sudo log file exists',
    description: 'Sudo actions should be logged to a dedicated file.',
    remediation: 'Add Defaults logfile="/var/log/sudo.log" to /etc/sudoers',
  },
  '5.4.1': {
    id: '5.4.1', level: 1, family: 'access',
    title: 'Ensure password creation requirements are configured',
    description: 'Strong password policy reduces risk from weak credentials.',
    remediation: 'Configure /etc/security/pwquality.conf: minlen=14, dcredit=-1, ucredit=-1, ocredit=-1, lcredit=-1',
  },
  '5.4.2': {
    id: '5.4.2', level: 1, family: 'access',
    title: 'Ensure lockout for failed password attempts',
    description: 'Account lockout after failed attempts prevents brute force.',
    remediation: 'Configure pam_faillock: deny=5, unlock_time=900 in /etc/pam.d/system-auth',
  },
  '5.4.4': {
    id: '5.4.4', level: 1, family: 'access',
    title: 'Ensure password expiration is 365 days or less',
    description: 'Password aging limits exposure if credentials are compromised.',
    remediation: 'Set PASS_MAX_DAYS 365 in /etc/login.defs',
  },
  '5.4.5': {
    id: '5.4.5', level: 1, family: 'access',
    title: 'Ensure minimum days between password changes is 7 or more',
    description: 'Minimum days between changes prevents rapid cycling.',
    remediation: 'Set PASS_MIN_DAYS 7 in /etc/login.defs',
  },

  // ═══════════════════════════════════════════════════════════════
  // 6.x — System Maintenance
  // ═══════════════════════════════════════════════════════════════

  '6.1.1': {
    id: '6.1.1', level: 1, family: 'maintenance',
    title: 'Ensure permissions on /etc/passwd are configured',
    description: '/etc/passwd should be readable by all but writable only by root.',
    remediation: 'chown root:root /etc/passwd && chmod 644 /etc/passwd',
  },
  '6.1.2': {
    id: '6.1.2', level: 1, family: 'maintenance',
    title: 'Ensure permissions on /etc/shadow are configured',
    description: '/etc/shadow should be accessible only by root.',
    remediation: 'chown root:root /etc/shadow && chmod 640 /etc/shadow',
  },
  '6.1.3': {
    id: '6.1.3', level: 1, family: 'maintenance',
    title: 'Ensure permissions on /etc/group are configured',
    description: '/etc/group should be root:root 644.',
    remediation: 'chown root:root /etc/group && chmod 644 /etc/group',
  },
  '6.1.6': {
    id: '6.1.6', level: 1, family: 'maintenance',
    title: 'Ensure no world-writable files exist',
    description: 'World-writable files can be modified by any user.',
    remediation: 'Run: find / -xdev -type f -perm -0002 | xargs chmod o-w',
  },
  '6.1.10': {
    id: '6.1.10', level: 1, family: 'maintenance',
    title: 'Ensure no unowned files or directories exist',
    description: 'Unowned files may be orphaned from deleted accounts.',
    remediation: 'Run: find / -xdev -nouser -o -nogroup | xargs chown root:root',
  },
  '6.2.1': {
    id: '6.2.1', level: 1, family: 'maintenance',
    title: 'Ensure password fields are not empty',
    description: 'Accounts with empty password fields can be accessed without credentials.',
    remediation: 'Run: awk -F: \'($2 == "") { print }\' /etc/shadow — set passwords for all accounts.',
  },
  '6.2.2': {
    id: '6.2.2', level: 1, family: 'maintenance',
    title: 'Ensure no legacy "+" entries exist in /etc/passwd',
    description: 'Legacy NIS "+" entries in passwd file can allow unauthorized access.',
    remediation: 'Remove any lines starting with "+" from /etc/passwd',
  },
  '6.2.5': {
    id: '6.2.5', level: 1, family: 'maintenance',
    title: 'Ensure root is the only UID 0 account',
    description: 'Only root should have UID 0 to prevent privilege escalation.',
    remediation: 'Run: awk -F: \'($3 == 0) { print $1 }\' /etc/passwd — remove extra UID-0 accounts.',
  },
  '6.2.6': {
    id: '6.2.6', level: 1, family: 'maintenance',
    title: 'Ensure root PATH integrity',
    description: 'Root\'s PATH should not include writable directories.',
    remediation: 'Remove . and group/world-writable directories from root\'s PATH.',
  },
  '6.2.9': {
    id: '6.2.9', level: 1, family: 'maintenance',
    title: 'Ensure no duplicate UIDs exist',
    description: 'Duplicate UIDs allow one user to masquerade as another.',
    remediation: 'Assign unique UIDs to all users in /etc/passwd.',
  },
  '6.2.10': {
    id: '6.2.10', level: 1, family: 'maintenance',
    title: 'Ensure no duplicate GIDs exist',
    description: 'Duplicate GIDs can lead to unintended access.',
    remediation: 'Assign unique GIDs to all groups in /etc/group.',
  },
};

/** Return control by ID, or null if not found */
export function getCisControl(id: string): CisControl | null {
  return CIS_V81_CONTROLS[id] ?? null;
}

/** Return all controls for a given family */
export function getCisControlsByFamily(family: string): CisControl[] {
  return Object.values(CIS_V81_CONTROLS).filter((c) => c.family === family);
}

/** Return all Level 1 controls */
export function getCisLevel1Controls(): CisControl[] {
  return Object.values(CIS_V81_CONTROLS).filter((c) => c.level === 1);
}
