import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../api/models.dart';
import '../../../auth/google_id_token.dart';
import '../../../auth/login_errors.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/app_version.dart';
import '../../../core/theme.dart';
import '../../../shared/widgets.dart';

enum _LoginMode { otp, google, pin, password }

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  _LoginMode _mode = _LoginMode.otp;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _pin = TextEditingController();
  bool _otpSent = false;
  bool _busy = false;
  bool _hidePassword = true;
  bool _hidePin = true;
  String? _error;
  String? _devHint;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _code.dispose();
    _pin.dispose();
    super.dispose();
  }

  void _selectMode(_LoginMode mode) {
    setState(() {
      _mode = mode;
      _error = null;
      if (mode != _LoginMode.otp) _otpSent = false;
    });
  }

  Future<void> _apply(Future<LoginResult> Function() login) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await login();
      await ref.read(sessionProvider.notifier).setSession(res.user, res.tokens);
      if (!mounted) return;
      context.go('/select-society');
    } catch (e, st) {
      logLoginFailure(e, st);
      setState(() => _error = loginErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestOtp() async {
    final phone = _phone.text.trim();
    if (phone.length < 10) {
      setState(() => _error = 'Enter the 10-digit mobile your society onboarded.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _devHint = null;
    });
    try {
      final res = await ref.read(apiProvider).requestOtp(phone);
      setState(() {
        _otpSent = true;
        if (res.devCode != null) _devHint = 'Dev OTP: ${res.devCode}';
      });
    } catch (e, st) {
      logLoginFailure(e, st);
      setState(() => _error = loginErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signInGoogle() async {
    await _apply(() async {
      final config = ref.read(apiConfigProvider);
      if (config.allowsDevGoogle) {
        final token = googleIdTokenForApi(
          config: config,
          phone: _phone.text,
          googleIdToken: null,
        );
        if (token == null) {
          throw StateError('Enter the onboarded mobile number.');
        }
        return ref.read(apiProvider).loginGoogle(token);
      }

      final configError = googleSignInConfigError(config.googleServerClientId);
      if (configError != null) {
        throw StateError(configError);
      }

      final raw = await ref.read(googleIdTokenSourceProvider).fetchIdToken(
            serverClientId: config.googleServerClientId,
          );
      final token = googleIdTokenForApi(
        config: config,
        phone: '',
        googleIdToken: raw,
      );
      if (token == null) {
        throw StateError(googleSignInDidNotComplete);
      }
      return ref.read(apiProvider).loginGoogle(token);
    });
  }

  Future<void> _openPrivacy() async {
    final url = Uri.parse(ref.read(apiConfigProvider).resolvedPrivacyPolicyUrl);
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (!session.loading && session.user != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/select-society');
      });
    }

    if (session.loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(key: AppKeys.loginBusy),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 96),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: ShCard(
                    padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
                    child: AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Center(child: BrandMark()),
                          const SizedBox(height: 18),
                          Text(
                            'Welcome back',
                            textAlign: TextAlign.center,
                            style: displayStyle(size: 26),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            _modeHint,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'sans-serif',
                              color: Colors.black54,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 22),
                          if (_mode == _LoginMode.otp) ..._otpForm(),
                          if (_mode == _LoginMode.google) ..._googleForm(),
                          if (_mode == _LoginMode.pin) ..._pinForm(),
                          if (_mode == _LoginMode.password) ..._passwordForm(),
                          if (_devHint != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              _devHint!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppColors.alert),
                            ),
                          ],
                          if (_error != null) ...[
                            const SizedBox(height: 14),
                            _ErrorBanner(message: _error!),
                          ],
                          const SizedBox(height: 18),
                          _otherWays(),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: _LoginVersionFooter(
                info: ref.watch(installedAppInfoProvider),
                onUpdate: () => ref.read(appVersionSourceProvider).startUpdate(),
                onPrivacy: _openPrivacy,
              ),
            ),
            if (_busy)
              const ColoredBox(
                color: Color(0x66FFFAF4),
                child: Center(
                  child: CircularProgressIndicator(key: AppKeys.loginBusy),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String get _modeHint => switch (_mode) {
        _LoginMode.otp =>
          'Use the mobile number your society onboarded.',
        _LoginMode.google =>
          ref.watch(apiConfigProvider).allowsDevGoogle
              ? 'Dev Google uses your onboarded mobile as the sign-in.'
              : 'Continue with the Google account your society onboarded.',
        _LoginMode.pin =>
          'Returning residents can unlock with the PIN set in Account.',
        _LoginMode.password =>
          'Committee email and password. Residents can use OTP instead.',
      };

  List<Widget> _otpForm() => [
        _PhoneField(
          controller: _phone,
          onSubmitted: (_) => _otpSent ? _verifyOtp() : _requestOtp(),
        ),
        if (_otpSent) ...[
          const SizedBox(height: 12),
          TextField(
            key: AppKeys.loginOtpCode,
            controller: _code,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.oneTimeCode],
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onSubmitted: (_) => _verifyOtp(),
            decoration: const InputDecoration(
              labelText: '6-digit OTP',
              counterText: '',
            ),
          ),
        ],
        const SizedBox(height: 16),
        ShPrimaryButton(
          key: AppKeys.loginSubmit,
          label: _otpSent ? 'Verify and continue' : 'Send OTP',
          busy: _busy,
          onPressed: () {
            if (_otpSent) {
              _verifyOtp();
            } else {
              _requestOtp();
            }
          },
        ),
        if (_otpSent)
          TextButton(
            onPressed: _busy ? null : _requestOtp,
            child: const Text('Resend OTP'),
          ),
      ];

  void _verifyOtp() {
    if (_code.text.trim().length < 4) {
      setState(() => _error = 'Enter the OTP sent to your mobile.');
      return;
    }
    _apply(
      () => ref.read(apiProvider).verifyOtp(
            _phone.text.trim(),
            _code.text.trim(),
          ),
    );
  }

  List<Widget> _googleForm() {
    final isDev = ref.watch(apiConfigProvider).allowsDevGoogle;
    return [
      if (isDev) ...[
        _PhoneField(
          controller: _phone,
          label: 'Mobile (dev)',
          onSubmitted: (_) => _signInGoogle(),
        ),
        const SizedBox(height: 16),
      ],
      if (!isDev &&
          googleSignInConfigError(
                ref.watch(apiConfigProvider).googleServerClientId,
              ) !=
              null) ...[
        const Text(
          'Google Sign-In is not configured in this build. Use OTP.',
          style: TextStyle(color: AppColors.danger, fontSize: 13, height: 1.35),
        ),
        const SizedBox(height: 12),
      ],
      ShPrimaryButton(
        key: AppKeys.loginSubmit,
        label: isDev ? 'Continue with Google (dev)' : 'Continue with Google',
        busy: _busy,
        onPressed: _signInGoogle,
      ),
    ];
  }

  List<Widget> _pinForm() => [
        _PhoneField(
          controller: _phone,
          onSubmitted: (_) => _submitPin(),
        ),
        const SizedBox(height: 12),
        TextField(
          key: AppKeys.loginPin,
          controller: _pin,
          obscureText: _hidePin,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.oneTimeCode],
          maxLength: 6,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onSubmitted: (_) => _submitPin(),
          decoration: InputDecoration(
            labelText: 'PIN',
            counterText: '',
            suffixIcon: IconButton(
              tooltip: _hidePin ? 'Show PIN' : 'Hide PIN',
              onPressed: () => setState(() => _hidePin = !_hidePin),
              icon: Icon(_hidePin ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            ),
          ),
        ),
        const SizedBox(height: 16),
        ShPrimaryButton(
          key: AppKeys.loginSubmit,
          label: 'Sign in with PIN',
          busy: _busy,
          onPressed: _submitPin,
        ),
      ];

  void _submitPin() {
    if (_phone.text.trim().length < 10 || _pin.text.trim().length < 4) {
      setState(() => _error = 'Enter your onboarded mobile and PIN.');
      return;
    }
    _apply(
      () => ref.read(apiProvider).loginPin(
            _phone.text.trim(),
            _pin.text.trim(),
          ),
    );
  }

  List<Widget> _passwordForm() => [
        TextField(
          key: AppKeys.loginEmail,
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: AppKeys.loginPassword,
          controller: _password,
          obscureText: _hidePassword,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _submitPassword(),
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: IconButton(
              tooltip: _hidePassword ? 'Show password' : 'Hide password',
              onPressed: () => setState(() => _hidePassword = !_hidePassword),
              icon: Icon(
                _hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        ShPrimaryButton(
          key: AppKeys.loginSubmit,
          label: 'Sign in',
          busy: _busy,
          onPressed: _submitPassword,
        ),
      ];

  void _submitPassword() {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    _apply(
      () => ref.read(apiProvider).loginPassword(
            _email.text.trim(),
            _password.text,
          ),
    );
  }

  Widget _otherWays() {
    return Column(
      children: [
        const Row(
          children: [
            Expanded(child: Divider(color: AppColors.sand)),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 10),
              child: Text(
                'Other ways',
                style: TextStyle(fontSize: 12, color: Colors.black45),
              ),
            ),
            Expanded(child: Divider(color: AppColors.sand)),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: [
            _WayChip(
              key: AppKeys.loginModeOtp,
              label: 'OTP',
              selected: _mode == _LoginMode.otp,
              onTap: () => _selectMode(_LoginMode.otp),
            ),
            _WayChip(
              key: AppKeys.loginModeGoogle,
              label: 'Google',
              selected: _mode == _LoginMode.google,
              onTap: () => _selectMode(_LoginMode.google),
            ),
            _WayChip(
              key: AppKeys.loginModePin,
              label: 'PIN',
              selected: _mode == _LoginMode.pin,
              onTap: () => _selectMode(_LoginMode.pin),
            ),
            _WayChip(
              key: AppKeys.loginModePassword,
              label: 'Email',
              selected: _mode == _LoginMode.password,
              onTap: () => _selectMode(_LoginMode.password),
            ),
          ],
        ),
      ],
    );
  }
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({
    required this.controller,
    this.label = 'Mobile number',
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: AppKeys.loginPhone,
      controller: controller,
      keyboardType: TextInputType.phone,
      textInputAction: TextInputAction.done,
      autofillHints: const [AutofillHints.telephoneNumber],
      maxLength: 10,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        hintText: '10-digit Indian mobile',
        counterText: '',
        prefixText: '+91  ',
      ),
    );
  }
}

class _WayChip extends StatelessWidget {
  const _WayChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: AppColors.mist,
      showCheckmark: false,
      labelStyle: TextStyle(
        color: selected ? AppColors.leafDark : AppColors.ink,
        fontWeight: FontWeight.w600,
        fontSize: 13,
      ),
      side: BorderSide(color: selected ? AppColors.leaf : AppColors.sand),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0x14A4161A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Text(
          message,
          key: AppKeys.loginError,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: 'sans-serif',
            color: AppColors.danger,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

class _LoginVersionFooter extends StatelessWidget {
  const _LoginVersionFooter({
    required this.info,
    required this.onUpdate,
    required this.onPrivacy,
  });

  final AsyncValue<InstalledAppInfo> info;
  final Future<void> Function() onUpdate;
  final Future<void> Function() onPrivacy;

  @override
  Widget build(BuildContext context) {
    return info.when(
      data: (value) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Installed version ${value.versionLabel}',
              key: AppKeys.loginVersion,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54, fontSize: 13),
            ),
            if (value.updateAvailable) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                key: AppKeys.loginUpdate,
                onPressed: () => onUpdate(),
                child: const Text('Update'),
              ),
            ],
            TextButton(
              onPressed: () => onPrivacy(),
              child: const Text('Privacy'),
            ),
          ],
        ),
      ),
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}
