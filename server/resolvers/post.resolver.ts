import {
  Arg,
  Ctx,
  Resolver,
  Query,
  Mutation,
  ObjectType,
  InputType,
  Field,
  UseMiddleware
} from "type-graphql";
import {
  Length,
  MaxLength,
} from 'class-validator';
import {
  AuthenticationError,
  UserInputError,
  ForbiddenError,
} from 'apollo-server-errors';
import { Post } from "../entities/post.entity";
import { Draft } from '../entities/draft.entity';
import { Type } from "../entities/type.entity";
import { User, } from "../entities/user.entity";
import { MyContext } from "../types";
import { isAuth } from "../middleware/isAuth";

@InputType()
class PostMutationInput {
  @Field()
  @Length(1,255)
  title: string;
  @Field()
  @Length(1,20)
  slug: string;
  @Field({ nullable: true })
  body: string;
  @Field()
  type: string;
}

// Input for single post query
// Unique properties only
@InputType()
class PostQueryInput {
  @Field({ nullable: true })
  id?: string;
  @Field({ nullable: true })
  slug?: string;
  @Field({ nullable: true })
  title?: string;
}

// Input for multiple post query
// Non-Unique properties only
@InputType()
class PostsQueryInput {
  @Field({ nullable: true })
  type?: string;
  @Field({ nullable: true })
  writer?: string;
}

// use middlware to add authentication
@Resolver(()=>Post)
export class PostResolver {
  @Query(() => Post, { nullable: true })
  async post(
    @Arg('input') input: PostQueryInput,
    @Ctx() ctx: MyContext
  ): Promise<Post|null> {
    const repo = ctx.em.getRepository(Post);
    const post = await repo.findOne({ ...input }, {
      populate: ['type.posts','writer.posts']
    });
    return post;
  }

  // for paginated posts
  @Query(() => [Post], { nullable: true })
  async Posts(
    @Arg('input') input: PostsQueryInput,
    @Arg('limit', { defaultValue: 10 }) limit: number,
    @Arg('offset', { defaultValue: 0 }) offset: number,
    @Ctx() ctx: MyContext
  ): Promise<Post[]|null> {
    const repo = ctx.em.getRepository(Post);
    const populate = ['type.posts','writer.posts'];
    const filter={} as {
      type: Type, writer: User
    };
    if(input.type) {
      try {
        const type =
          await ctx.em.getRepository(Type)
            .findOneOrFail({id: input.type});
        filter.type = type;
      } catch(err) { throw new UserInputError(err) };
    }
    if(input.writer) {
      try {
        const writer =
          await ctx.em.getRepository(User)
            .findOneOrFail({id: input.writer});
        filter.writer = writer;
      } catch(err) { throw new UserInputError(err) };
    }
    return await repo.find({ ...filter }, {
      populate,
      limit,
      offset,
    });
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg('draft_id') draft_id: string,
    @Arg('slug') slug: string,
    @Ctx() ctx: MyContext
  ): Promise<Post> {
    let user: User;
    try {
      user = 
        await ctx.em.getRepository(User)
          .findOneOrFail({id: ctx.req.user});
    } catch (err) { throw new AuthenticationError(err) }
    let draft: Draft;
    try {
      draft =
        await ctx.em.getRepository(Draft)
          .findOneOrFail({id: draft_id});
    } catch (err) { throw new UserInputError(err) }
    if(draft.writer!==user) 
      throw new ForbiddenError('User is not the writer of this draft');
    const post = new Post(draft);
    post.slug = slug;
    try {
      await ctx.em.getRepository(Post).persist(post).flush();
    } catch(err) { throw new UserInputError(err) }
    try {
      await ctx.em.getRepository(Draft).remove(draft).flush();
    } catch(err) { throw new UserInputError(err) }
    return post;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id") id: string,
    @Ctx() ctx: MyContext
  ): Promise<boolean> {
    let user: User;
    try {
      user = 
        await ctx.em.getRepository(User)
          .findOneOrFail({id: ctx.req.user});
    } catch(err) { throw new AuthenticationError(err) }
    const repo = ctx.em.getRepository(Post);
    let post;
    try {
      post = await repo.findOneOrFail({id});
    } catch(err) { throw new UserInputError(err); }
    if(user!==post.writer) 
      throw new ForbiddenError('User is not the writer of this post');
    await repo.remove(post).flush();
    return true;
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("id") id: string,
    @Arg("input") input: PostMutationInput,
    @Ctx() ctx: MyContext
  ): Promise<Post> {
    let user: User;
    try {
      user = 
        await ctx.em.getRepository(User)
          .findOneOrFail({id: ctx.req.user});
    } catch(err) { throw new AuthenticationError(err); }
    const repo = ctx.em.getRepository(Post);
    let post;
    try {
      post = await repo.findOneOrFail({id});
    } catch (err) { throw new UserInputError(err) }
    if(user!==post.writer) 
      throw new ForbiddenError('User is not the writer of the post');
    post.title = input.title;
    post.slug = input.slug;
    post.body = input.body;
    try {
      await ctx.em.flush();
    } catch(err) { throw new UserInputError(err) }
    return post;
  }
}