// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
// import { ConfigService } from '@nestjs/config';
// import { AuthService } from '../auth.service';
//
// @Injectable()
// export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
//   constructor(
//     private readonly configService: ConfigService,
//     private readonly authService: AuthService,
//   ) {
//     super({
//       clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
//       clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
//       // Must match the redirect URI registered in Google Cloud Console
//       callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
//       scope: ['email', 'profile'],
//     });
//   }
//
//   // Called after Google returns the user profile; upsert user and return it
//   async validate(
//     _accessToken: string,
//     _refreshToken: string,
//     profile: Profile,
//     done: VerifyCallback,
//   ): Promise<void> {
//     const email = profile.emails?.[0]?.value;
//     const displayName = profile.displayName ?? profile.username ?? 'Unknown';
//
//     if (!email) {
//       return done(new Error('Google account has no email address'), undefined);
//     }
//
//     try {
//       const user = await this.authService.findOrCreateGoogleUser({
//         googleId: profile.id,
//         email,
//         displayName,
//         avatar: profile.photos?.[0]?.value,
//       });
//       done(null, user);
//     } catch (err) {
//       done(err as Error, undefined);
//     }
//   }
// }
