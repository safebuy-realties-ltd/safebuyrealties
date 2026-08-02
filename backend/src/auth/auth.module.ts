import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { LoginAttemptsService } from "./login-attempts.service";
import { SessionsService } from "./sessions.service";
import { SessionsController } from "./sessions.controller";
import { resolveJwtSecret } from "../config/jwt-secret";

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config.get<string>("JWT_SECRET")),
        // The floor, not the policy. Every token this application signs passes an explicit
        // `expiresIn`, because E5-S5 makes the access token's life depend on whether there is a
        // session behind it that can be refreshed. This stays as the value anything signed without
        // asking would get, so a future caller that forgets gets the old behaviour rather than a
        // token that never expires.
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [AuthController, SessionsController],
  providers: [AuthService, JwtStrategy, LoginAttemptsService, SessionsService],
  exports: [AuthService, SessionsService, JwtModule, PassportModule],
})
export class AuthModule {}
